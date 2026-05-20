
-- 1. Tabela disciplina
CREATE TABLE public.disciplina (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sigla     text        NOT NULL,
  nome      text,
  periodo   smallint    NOT NULL CHECK (periodo BETWEEN 1 AND 12),
  ativa     boolean     NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disciplina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disciplina_select_authenticated"
  ON public.disciplina FOR SELECT TO authenticated USING (true);

CREATE POLICY "disciplina_admin_all"
  ON public.disciplina FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. Seed: disciplinas Afya P1
INSERT INTO public.disciplina (sigla, nome, periodo) VALUES
  ('SOI I',  'Saúde, Organização e Integração I',            1),
  ('HAM I',  'Habilidades e Atitudes Médicas I',             1),
  ('IESC I', 'Integração Ensino-Serviço-Comunidade I',       1),
  ('MCM I',  'Mecanismos de Controle dos Meios Internos I',  1);

-- 3. questao: adicionar disciplina_id, remover disciplina text + periodo int
ALTER TABLE public.questao
  ADD COLUMN disciplina_id uuid REFERENCES public.disciplina(id) ON DELETE SET NULL;

ALTER TABLE public.questao
  DROP COLUMN IF EXISTS disciplina,
  DROP COLUMN IF EXISTS periodo;

CREATE INDEX idx_questao_disciplina_id ON public.questao (disciplina_id);

-- 4. tema: adicionar disciplina_id, remover disciplina text + periodo int
ALTER TABLE public.tema
  ADD COLUMN disciplina_id uuid REFERENCES public.disciplina(id) ON DELETE SET NULL;

ALTER TABLE public.tema
  DROP COLUMN IF EXISTS disciplina,
  DROP COLUMN IF EXISTS periodo;

CREATE INDEX idx_tema_disciplina_id ON public.tema (disciplina_id);

-- 5. Recriar iniciar_tentativa
CREATE OR REPLACE FUNCTION public.iniciar_tentativa(p_prova_id uuid, p_modo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID; v_prova RECORD; v_tentativa RECORD; v_questoes JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  IF p_modo NOT IN ('simulado', 'estudo', 'visualizar') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo USING ERRCODE = 'P0002'; END IF;
  SELECT p.*, COUNT(q.id) AS total INTO v_prova FROM prova p LEFT JOIN questao q ON q.prova_id = p.id AND q.status = 'ativa' WHERE p.id = p_prova_id GROUP BY p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prova não encontrada' USING ERRCODE = 'P0003'; END IF;
  IF v_prova.total = 0 THEN RAISE EXCEPTION 'A prova não possui questões ativas' USING ERRCODE = 'P0004'; END IF;
  INSERT INTO tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em) VALUES (v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0, 0, NOW(), NOW()) RETURNING * INTO v_tentativa;
  INSERT INTO tentativa_resposta (tentativa_id, questao_id) SELECT v_tentativa.id, q.id FROM questao q WHERE q.prova_id = p_prova_id AND q.status = 'ativa' ORDER BY q.ordem_na_prova;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', dq.sigla, 'periodo', dq.periodo::int, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', dt.sigla, 'periodo', dt.periodo::int, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id LEFT JOIN disciplina dt ON dt.id = t.disciplina_id WHERE qt.questao_id = q.id)) ORDER BY q.ordem_na_prova) INTO v_questoes FROM questao q LEFT JOIN disciplina dq ON dq.id = q.disciplina_id WHERE q.prova_id = p_prova_id AND q.status = 'ativa';
  RETURN jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
END;
$function$;

-- 6. Recriar retomar_tentativa
CREATE OR REPLACE FUNCTION public.retomar_tentativa(p_tentativa_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID; v_tentativa RECORD; v_questoes JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_tentativa FROM tentativa WHERE id = p_tentativa_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003'; END IF;
  IF v_tentativa.status = 'finalizada' THEN RAISE EXCEPTION 'Tentativa já finalizada' USING ERRCODE = 'P0005'; END IF;
  UPDATE tentativa SET status = 'em_andamento', pausada_em = NULL WHERE id = p_tentativa_id RETURNING * INTO v_tentativa;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', dq.sigla, 'periodo', dq.periodo::int, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', dt.sigla, 'periodo', dt.periodo::int, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id LEFT JOIN disciplina dt ON dt.id = t.disciplina_id WHERE qt.questao_id = q.id)) ORDER BY q.ordem_na_prova) INTO v_questoes FROM questao q LEFT JOIN disciplina dq ON dq.id = q.disciplina_id WHERE q.prova_id = v_tentativa.prova_id AND q.status = 'ativa';
  RETURN jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
END;
$function$;

-- 7. Recriar finalizar_tentativa
CREATE OR REPLACE FUNCTION public.finalizar_tentativa(p_tentativa_id uuid, p_tempo_segundos int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID; v_tentativa RECORD; v_acertos INT; v_total_respondidas INT;
  v_nota NUMERIC(5,2); v_questoes JSONB; v_respostas JSONB; v_distribuicao JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_tentativa FROM tentativa WHERE id = p_tentativa_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003'; END IF;
  IF v_tentativa.status != 'finalizada' THEN
    UPDATE tentativa_resposta tr SET correta = (tr.alternativa_id IS NOT NULL AND tr.alternativa_id = (SELECT a.id FROM alternativa a WHERE a.questao_id = tr.questao_id AND a.correta = true LIMIT 1)) WHERE tr.tentativa_id = p_tentativa_id;
    SELECT COUNT(*) FILTER (WHERE tr.correta = true), COUNT(*) FILTER (WHERE tr.respondida_em IS NOT NULL) INTO v_acertos, v_total_respondidas FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id;
    v_nota := ROUND((v_acertos::NUMERIC / NULLIF(v_tentativa.total_questoes, 0)) * 100, 1);
    UPDATE tentativa SET status = 'finalizada', finalizada_em = NOW(), acertos = v_acertos, total_respondidas = v_total_respondidas, nota = v_nota, tempo_acumulado_segundos = COALESCE(p_tempo_segundos, tempo_acumulado_segundos) WHERE id = p_tentativa_id RETURNING * INTO v_tentativa;
    UPDATE questao q SET vezes_respondida = q.vezes_respondida + 1, vezes_acertada = q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END, taxa_acerto = ROUND(((q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END)::NUMERIC / (q.vezes_respondida + 1)) * 100, 2) FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id AND tr.questao_id = q.id AND tr.respondida_em IS NOT NULL;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', dq.sigla, 'periodo', dq.periodo::int, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', dt.sigla, 'periodo', dt.periodo::int)) FROM questao_tema qt2 JOIN tema t ON t.id = qt2.tema_id LEFT JOIN disciplina dt ON dt.id = t.disciplina_id WHERE qt2.questao_id = q.id)) ORDER BY q.ordem_na_prova) INTO v_questoes FROM questao q LEFT JOIN disciplina dq ON dq.id = q.disciplina_id WHERE q.prova_id = v_tentativa.prova_id AND q.status = 'ativa';
  SELECT jsonb_agg(row_to_json(tr)::jsonb ORDER BY tr.id) INTO v_respostas FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id;
  SELECT jsonb_agg(jsonb_build_object('tema', jsonb_build_object('id', sub.tema_id, 'nome', sub.tema_nome, 'disciplina', sub.tema_disciplina, 'periodo', sub.tema_periodo, 'parent_id', null, 'criado_em', null), 'total', sub.total, 'acertos', sub.acertos)) INTO v_distribuicao FROM (SELECT t.id AS tema_id, t.nome AS tema_nome, dt.sigla AS tema_disciplina, dt.periodo::int AS tema_periodo, COUNT(tr.id) AS total, COUNT(tr.id) FILTER (WHERE tr.correta = true) AS acertos FROM tentativa_resposta tr JOIN questao_tema qt ON qt.questao_id = tr.questao_id JOIN tema t ON t.id = qt.tema_id LEFT JOIN disciplina dt ON dt.id = t.disciplina_id WHERE tr.tentativa_id = p_tentativa_id GROUP BY t.id, t.nome, dt.sigla, dt.periodo) sub;
  RETURN jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb), 'respostas', COALESCE(v_respostas, '[]'::jsonb), 'distribuicao_temas', COALESCE(v_distribuicao, '[]'::jsonb));
END;
$function$;

-- 8. Recriar gerar_simulado_personalizado
CREATE OR REPLACE FUNCTION public.gerar_simulado_personalizado(p_tema_ids uuid[] DEFAULT NULL::uuid[], p_qtd integer DEFAULT 10, p_modo text DEFAULT 'simulado'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID; v_prova_id UUID; v_tentativa RECORD; v_questoes JSONB;
  v_total INT; v_nome TEXT; v_selected_ids UUID[]; v_edicao INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  IF p_modo NOT IN ('simulado', 'estudo') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo USING ERRCODE = 'P0002'; END IF;
  IF p_qtd < 1 OR p_qtd > 50 THEN RAISE EXCEPTION 'Quantidade deve ser entre 1 e 50' USING ERRCODE = 'P0006'; END IF;
  SELECT ARRAY(SELECT q.id FROM questao q WHERE q.status = 'ativa' AND (p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL OR EXISTS (SELECT 1 FROM questao_tema qt WHERE qt.questao_id = q.id AND qt.tema_id = ANY(p_tema_ids))) ORDER BY random() LIMIT p_qtd) INTO v_selected_ids;
  v_total := array_length(v_selected_ids, 1);
  IF v_total IS NULL OR v_total = 0 THEN RAISE EXCEPTION 'Nenhuma questão encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004'; END IF;
  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN v_nome := 'Simulado personalizado — ' || v_total || ' questões';
  ELSE SELECT 'Simulado — ' || string_agg(t.nome, ', ' ORDER BY t.nome) || ' — ' || v_total || 'q' INTO v_nome FROM tema t WHERE t.id = ANY(p_tema_ids); END IF;
  IF length(v_nome) > 200 THEN v_nome := left(v_nome, 197) || '...'; END IF;
  v_edicao := -(EXTRACT(EPOCH FROM clock_timestamp())::int % 2000000000);
  INSERT INTO prova (faculdade_id, nome, periodo, tipo, qtd_questoes, edicao) VALUES (NULL, v_nome, 0, 'processual', v_total, v_edicao) RETURNING id INTO v_prova_id;
  INSERT INTO tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em) VALUES (v_user_id, v_prova_id, p_modo, 'em_andamento', v_total, 0, 0, NOW(), NOW()) RETURNING * INTO v_tentativa;
  INSERT INTO tentativa_resposta (tentativa_id, questao_id) SELECT v_tentativa.id, unnest(v_selected_ids);
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', dq.sigla, 'periodo', dq.periodo::int, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', dt.sigla, 'periodo', dt.periodo::int, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt2 JOIN tema t ON t.id = qt2.tema_id LEFT JOIN disciplina dt ON dt.id = t.disciplina_id WHERE qt2.questao_id = q.id))) INTO v_questoes FROM questao q LEFT JOIN disciplina dq ON dq.id = q.disciplina_id WHERE q.id = ANY(v_selected_ids);
  RETURN jsonb_build_object('prova_id', v_prova_id, 'tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
END;
$function$;

-- 9. Recriar listar_temas_com_contagem (com disciplina_id no retorno)
DROP FUNCTION IF EXISTS public.listar_temas_com_contagem();
CREATE OR REPLACE FUNCTION public.listar_temas_com_contagem()
 RETURNS TABLE(id uuid, nome text, disciplina_id uuid, disciplina text, periodo integer, parent_id uuid, criado_em timestamp with time zone, qtd_questoes bigint)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.id, t.nome, t.disciplina_id, dq.sigla AS disciplina, dq.periodo::int AS periodo,
         t.parent_id, t.criado_em, COUNT(q.id) AS qtd_questoes
  FROM tema t
  LEFT JOIN disciplina dq ON dq.id = t.disciplina_id
  LEFT JOIN questao_tema qt ON qt.tema_id = t.id
  LEFT JOIN questao q ON q.id = qt.questao_id AND q.status = 'ativa'
  GROUP BY t.id, t.nome, t.disciplina_id, dq.sigla, dq.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$function$;

-- 10. Recriar get_desafio_diario
CREATE OR REPLACE FUNCTION public.get_desafio_diario()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid; v_hoje date; v_questao_id uuid;
  v_resposta public.desafio_diario_resposta%rowtype; v_total integer; v_acertos integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  v_hoje := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO public.desafio_diario (data, questao_id) SELECT v_hoje, q.id FROM public.questao q WHERE q.apto_desafio_diario = true ORDER BY random() LIMIT 1 ON CONFLICT (data) DO NOTHING;
  SELECT questao_id INTO v_questao_id FROM public.desafio_diario WHERE data = v_hoje;
  IF v_questao_id IS NULL THEN RETURN jsonb_build_object('disponivel', false, 'mensagem', 'Nenhuma questão disponível para o desafio de hoje.'); END IF;
  SELECT * INTO v_resposta FROM public.desafio_diario_resposta WHERE user_id = v_user_id AND data = v_hoje;
  SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE correta = true)::integer INTO v_total, v_acertos FROM public.desafio_diario_resposta WHERE data = v_hoje;
  IF FOUND AND v_resposta.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('disponivel', true, 'data', v_hoje,
      'questao', (SELECT jsonb_build_object('id', q.id, 'enunciado', q.enunciado, 'enunciado_apoio', q.enunciado_apoio, 'imagem_url', q.imagem_url, 'dificuldade', q.dificuldade, 'disciplina', dq.sigla, 'explicacao', q.explicacao) FROM public.questao q LEFT JOIN public.disciplina dq ON dq.id = q.disciplina_id WHERE q.id = v_questao_id),
      'alternativas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'letra', a.letra, 'texto', a.texto, 'ordem', a.ordem, 'correta', a.correta) ORDER BY a.ordem), '[]'::jsonb) FROM public.alternativa a WHERE a.questao_id = v_questao_id),
      'minha_resposta', jsonb_build_object('alternativa_id', v_resposta.alternativa_id, 'correta', v_resposta.correta, 'xp_ganho', v_resposta.xp_ganho, 'respondido_em', v_resposta.respondido_em),
      'estatistica', jsonb_build_object('total_responderam', v_total, 'percentual_acerto', CASE WHEN v_total > 0 THEN ROUND((v_acertos::numeric / v_total) * 100)::integer ELSE 0 END));
  ELSE
    RETURN jsonb_build_object('disponivel', true, 'data', v_hoje,
      'questao', (SELECT jsonb_build_object('id', q.id, 'enunciado', q.enunciado, 'enunciado_apoio', q.enunciado_apoio, 'imagem_url', q.imagem_url, 'dificuldade', q.dificuldade, 'disciplina', dq.sigla) FROM public.questao q LEFT JOIN public.disciplina dq ON dq.id = q.disciplina_id WHERE q.id = v_questao_id),
      'alternativas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'letra', a.letra, 'texto', a.texto, 'ordem', a.ordem) ORDER BY a.ordem), '[]'::jsonb) FROM public.alternativa a WHERE a.questao_id = v_questao_id),
      'minha_resposta', null,
      'estatistica', jsonb_build_object('total_responderam', v_total, 'percentual_acerto', CASE WHEN v_total > 0 THEN ROUND((v_acertos::numeric / v_total) * 100)::integer ELSE 0 END));
  END IF;
END;
$function$;
;
