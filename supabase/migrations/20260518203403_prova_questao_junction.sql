-- 1. Create prova_questao junction table
CREATE TABLE public.prova_questao (
  prova_id   UUID NOT NULL REFERENCES public.prova(id)   ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questao(id) ON DELETE CASCADE,
  ordem      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT prova_questao_pkey PRIMARY KEY (prova_id, questao_id)
);
ALTER TABLE public.prova_questao ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_prova_questao_prova_id   ON public.prova_questao (prova_id);
CREATE INDEX idx_prova_questao_questao_id ON public.prova_questao (questao_id);
-- select for all authenticated
CREATE POLICY "prova_questao_select_authenticated" ON public.prova_questao
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- admin full access (same pattern as other tables)
CREATE POLICY "prova_questao_admin_all" ON public.prova_questao
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. Migrate existing data from questao.prova_id to prova_questao
INSERT INTO public.prova_questao (prova_id, questao_id, ordem)
SELECT prova_id, id, COALESCE(ordem_na_prova, 0)
FROM public.questao
WHERE prova_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Replace iniciar_tentativa RPC
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.iniciar_tentativa(p_prova_id uuid, p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id   UUID; v_prova RECORD; v_tentativa RECORD; v_questoes JSONB; v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  IF p_modo NOT IN ('simulado', 'estudo', 'visualizar') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo USING ERRCODE = 'P0002'; END IF;
  SELECT p.*, COUNT(pq.questao_id) FILTER (WHERE q.status = 'ativa') AS total
  INTO v_prova
  FROM prova p
  LEFT JOIN prova_questao pq ON pq.prova_id = p.id
  LEFT JOIN questao q ON q.id = pq.questao_id
  WHERE p.id = p_prova_id
  GROUP BY p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prova não encontrada' USING ERRCODE = 'P0003'; END IF;
  IF v_prova.total = 0 THEN RAISE EXCEPTION 'A prova não possui questões ativas' USING ERRCODE = 'P0004'; END IF;
  INSERT INTO tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  VALUES (v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0, 0, NOW(), NOW())
  RETURNING * INTO v_tentativa;
  INSERT INTO tentativa_resposta (tentativa_id, questao_id)
  SELECT v_tentativa.id, q.id
  FROM prova_questao pq
  JOIN questao q ON q.id = pq.questao_id
  WHERE pq.prova_id = p_prova_id AND q.status = 'ativa'
  ORDER BY pq.ordem;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', p_prova_id, 'ordem_na_prova', pq.ordem, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', q.disciplina, 'periodo', q.periodo, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', t.disciplina, 'periodo', t.periodo, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id WHERE qt.questao_id = q.id)) ORDER BY pq.ordem) INTO v_questoes FROM prova_questao pq JOIN questao q ON q.id = pq.questao_id WHERE pq.prova_id = p_prova_id AND q.status = 'ativa';
  v_result := jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
  RETURN v_result;
END;
$function$;

-- 4. Replace retomar_tentativa RPC
CREATE OR REPLACE FUNCTION public.retomar_tentativa(p_tentativa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID; v_tentativa RECORD; v_questoes JSONB; v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_tentativa FROM tentativa WHERE id = p_tentativa_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003'; END IF;
  IF v_tentativa.status = 'finalizada' THEN RAISE EXCEPTION 'Tentativa já finalizada' USING ERRCODE = 'P0005'; END IF;
  UPDATE tentativa SET status = 'em_andamento', pausada_em = NULL WHERE id = p_tentativa_id RETURNING * INTO v_tentativa;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', v_tentativa.prova_id, 'ordem_na_prova', pq.ordem, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', q.disciplina, 'periodo', q.periodo, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', t.disciplina, 'periodo', t.periodo, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id WHERE qt.questao_id = q.id)) ORDER BY pq.ordem) INTO v_questoes FROM prova_questao pq JOIN questao q ON q.id = pq.questao_id WHERE pq.prova_id = v_tentativa.prova_id AND q.status = 'ativa';
  v_result := jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
  RETURN v_result;
END;
$function$;

-- 5. Replace finalizar_tentativa RPC
CREATE OR REPLACE FUNCTION public.finalizar_tentativa(p_tentativa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id           UUID;
  v_tentativa         RECORD;
  v_acertos           INT;
  v_total_respondidas INT;
  v_nota              NUMERIC(5,2);
  v_questoes          JSONB;
  v_respostas         JSONB;
  v_distribuicao      JSONB;
  v_result            JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_tentativa FROM tentativa WHERE id = p_tentativa_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003';
  END IF;
  IF v_tentativa.status = 'finalizada' THEN
    RAISE EXCEPTION 'Tentativa já finalizada' USING ERRCODE = 'P0005';
  END IF;
  UPDATE tentativa_resposta tr
  SET correta = (tr.alternativa_id IS NOT NULL AND tr.alternativa_id = (SELECT a.id FROM alternativa a WHERE a.questao_id = tr.questao_id AND a.correta = true LIMIT 1))
  WHERE tr.tentativa_id = p_tentativa_id;
  SELECT COUNT(*) FILTER (WHERE tr.correta = true), COUNT(*) FILTER (WHERE tr.respondida_em IS NOT NULL)
  INTO v_acertos, v_total_respondidas FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id;
  v_nota := ROUND((v_acertos::NUMERIC / NULLIF(v_tentativa.total_questoes, 0)) * 100, 1);
  UPDATE tentativa SET status = 'finalizada', finalizada_em = NOW(), acertos = v_acertos, total_respondidas = v_total_respondidas, nota = v_nota WHERE id = p_tentativa_id RETURNING * INTO v_tentativa;
  UPDATE questao q SET vezes_respondida = q.vezes_respondida + 1, vezes_acertada = q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END, taxa_acerto = ROUND(((q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END)::NUMERIC / (q.vezes_respondida + 1)) * 100, 2) FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id AND tr.questao_id = q.id AND tr.respondida_em IS NOT NULL;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', v_tentativa.prova_id, 'ordem_na_prova', pq.ordem, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', q.disciplina, 'periodo', q.periodo, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', t.disciplina, 'periodo', t.periodo)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id WHERE qt.questao_id = q.id)) ORDER BY pq.ordem) INTO v_questoes FROM prova_questao pq JOIN questao q ON q.id = pq.questao_id WHERE pq.prova_id = v_tentativa.prova_id AND q.status = 'ativa';
  SELECT jsonb_agg(row_to_json(tr)::jsonb ORDER BY tr.id) INTO v_respostas FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id;
  SELECT jsonb_agg(jsonb_build_object('tema_id', sub.tema_id, 'tema_nome', sub.tema_nome, 'total', sub.total, 'acertos', sub.acertos)) INTO v_distribuicao FROM (SELECT t.id AS tema_id, t.nome AS tema_nome, COUNT(tr.id) AS total, COUNT(tr.id) FILTER (WHERE tr.correta = true) AS acertos FROM tentativa_resposta tr JOIN questao_tema qt ON qt.questao_id = tr.questao_id JOIN tema t ON t.id = qt.tema_id WHERE tr.tentativa_id = p_tentativa_id GROUP BY t.id, t.nome) sub;
  v_result := jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb), 'respostas', COALESCE(v_respostas, '[]'::jsonb), 'distribuicao_temas', COALESCE(v_distribuicao, '[]'::jsonb));
  RETURN v_result;
END;
$function$;
