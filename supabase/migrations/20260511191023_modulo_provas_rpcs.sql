set check_function_bodies = off;

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
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', q.disciplina, 'periodo', q.periodo, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', t.disciplina, 'periodo', t.periodo)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id WHERE qt.questao_id = q.id)) ORDER BY q.ordem_na_prova) INTO v_questoes FROM questao q WHERE q.prova_id = v_tentativa.prova_id AND q.status = 'ativa';
  SELECT jsonb_agg(row_to_json(tr)::jsonb ORDER BY tr.id) INTO v_respostas FROM tentativa_resposta tr WHERE tr.tentativa_id = p_tentativa_id;
  SELECT jsonb_agg(jsonb_build_object('tema_id', sub.tema_id, 'tema_nome', sub.tema_nome, 'total', sub.total, 'acertos', sub.acertos)) INTO v_distribuicao FROM (SELECT t.id AS tema_id, t.nome AS tema_nome, COUNT(tr.id) AS total, COUNT(tr.id) FILTER (WHERE tr.correta = true) AS acertos FROM tentativa_resposta tr JOIN questao_tema qt ON qt.questao_id = tr.questao_id JOIN tema t ON t.id = qt.tema_id WHERE tr.tentativa_id = p_tentativa_id GROUP BY t.id, t.nome) sub;
  v_result := jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb), 'respostas', COALESCE(v_respostas, '[]'::jsonb), 'distribuicao_temas', COALESCE(v_distribuicao, '[]'::jsonb));
  RETURN v_result;
END;
$function$;

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
  SELECT p.*, COUNT(q.id) AS total INTO v_prova FROM prova p LEFT JOIN questao q ON q.prova_id = p.id AND q.status = 'ativa' WHERE p.id = p_prova_id GROUP BY p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prova não encontrada' USING ERRCODE = 'P0003'; END IF;
  IF v_prova.total = 0 THEN RAISE EXCEPTION 'A prova não possui questões ativas' USING ERRCODE = 'P0004'; END IF;
  INSERT INTO tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em) VALUES (v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0, 0, NOW(), NOW()) RETURNING * INTO v_tentativa;
  INSERT INTO tentativa_resposta (tentativa_id, questao_id) SELECT v_tentativa.id, q.id FROM questao q WHERE q.prova_id = p_prova_id AND q.status = 'ativa' ORDER BY q.ordem_na_prova;
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', q.disciplina, 'periodo', q.periodo, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', t.disciplina, 'periodo', t.periodo, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id WHERE qt.questao_id = q.id)) ORDER BY q.ordem_na_prova) INTO v_questoes FROM questao q WHERE q.prova_id = p_prova_id AND q.status = 'ativa';
  v_result := jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pausar_tentativa(p_tentativa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID; v_tentativa RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_tentativa FROM tentativa WHERE id = p_tentativa_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003'; END IF;
  IF v_tentativa.status = 'finalizada' THEN RAISE EXCEPTION 'Tentativa já finalizada' USING ERRCODE = 'P0005'; END IF;
  UPDATE tentativa SET status = 'pausada', pausada_em = NOW() WHERE id = p_tentativa_id;
END;
$function$;

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
  SELECT jsonb_agg(jsonb_build_object('id', q.id, 'prova_id', q.prova_id, 'ordem_na_prova', q.ordem_na_prova, 'codigo_externo', q.codigo_externo, 'enunciado_apoio', q.enunciado_apoio, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'imagem_legenda', q.imagem_legenda, 'formato', q.formato, 'explicacao', q.explicacao, 'dificuldade', q.dificuldade, 'disciplina', q.disciplina, 'periodo', q.periodo, 'status', q.status, 'criado_em', q.criado_em, 'atualizado_em', q.atualizado_em, 'alternativas', (SELECT jsonb_agg(jsonb_build_object('id', a.id, 'questao_id', a.questao_id, 'letra', a.letra, 'texto', a.texto, 'correta', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE a.correta END, 'ordem', a.ordem, 'imagem_url', a.imagem_url) ORDER BY a.ordem) FROM alternativa a WHERE a.questao_id = q.id), 'temas', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'disciplina', t.disciplina, 'periodo', t.periodo, 'parent_id', t.parent_id, 'criado_em', t.criado_em)) FROM questao_tema qt JOIN tema t ON t.id = qt.tema_id WHERE qt.questao_id = q.id)) ORDER BY q.ordem_na_prova) INTO v_questoes FROM questao q WHERE q.prova_id = v_tentativa.prova_id AND q.status = 'ativa';
  v_result := jsonb_build_object('tentativa', row_to_json(v_tentativa)::jsonb, 'questoes', COALESCE(v_questoes, '[]'::jsonb));
  RETURN v_result;
END;
$function$;

INSERT INTO public.faculdade (id, nome, sigla, rede, ativa) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Afya Faculdades', 'AFYA', 'Afya', true) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tema (id, nome, disciplina, periodo) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Anatomia',   'Ciências Básicas', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Fisiologia', 'Ciências Básicas', 1),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Bioquímica', 'Ciências Básicas', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.prova (id, faculdade_id, nome, periodo, ano, semestre, tipo, subtipo_nacional, qtd_questoes, tempo_sugerido_minutos) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Prova N1 2024 — Período 1', 1, 2024, 1, 'nacional', 'N1', 5, 60),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Prova N2 2024 — Período 1', 1, 2024, 1, 'nacional', 'N2', 5, 60),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Prova N1 2023 — Período 1', 1, 2023, 1, 'nacional', 'N1', 5, 60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.questao (id, prova_id, ordem_na_prova, enunciado, formato, status, disciplina, periodo, dificuldade, revisado) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1, 'O osso mais longo do corpo humano é:', 'multipla_escolha', 'ativa', 'Ciências Básicas', 1, 2, true),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 2, 'Qual é a principal função do coração?', 'multipla_escolha', 'ativa', 'Ciências Básicas', 1, 2, true),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 3, 'O processo de quebra de glicose para obtenção de energia é chamado de:', 'multipla_escolha', 'ativa', 'Ciências Básicas', 1, 3, true),
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', 4, 'Qual é a molécula responsável pelo transporte de oxigênio no sangue?', 'multipla_escolha', 'ativa', 'Ciências Básicas', 1, 2, true),
  ('dddddddd-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', 5, 'O processo de síntese de proteínas a partir do RNA mensageiro é chamado de:', 'multipla_escolha', 'ativa', 'Ciências Básicas', 1, 3, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (id, questao_id, letra, texto, correta, ordem) VALUES
  ('eeeeeeee-0001-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'A', 'Fêmur',  true,  1),
  ('eeeeeeee-0001-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'B', 'Tíbia',  false, 2),
  ('eeeeeeee-0001-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'C', 'Fíbula', false, 3),
  ('eeeeeeee-0001-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'D', 'Úmero',  false, 4),
  ('eeeeeeee-0001-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 'E', 'Rádio',  false, 5),
  ('eeeeeeee-0002-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'A', 'Filtrar o sangue', false, 1),
  ('eeeeeeee-0002-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'B', 'Produzir hormônios', false, 2),
  ('eeeeeeee-0002-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 'C', 'Bombear sangue para todo o organismo', true, 3),
  ('eeeeeeee-0002-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000002', 'D', 'Absorver nutrientes', false, 4),
  ('eeeeeeee-0002-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000002', 'E', 'Produzir células sanguíneas', false, 5),
  ('eeeeeeee-0003-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 'A', 'Fotossíntese', false, 1),
  ('eeeeeeee-0003-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003', 'B', 'Glicólise', true, 2),
  ('eeeeeeee-0003-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003', 'C', 'Lipólise', false, 3),
  ('eeeeeeee-0003-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000003', 'D', 'Proteólise', false, 4),
  ('eeeeeeee-0003-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000003', 'E', 'Gliconeogênese', false, 5),
  ('eeeeeeee-0004-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004', 'A', 'Albumina', false, 1),
  ('eeeeeeee-0004-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 'B', 'Globulina', false, 2),
  ('eeeeeeee-0004-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 'C', 'Fibrinogênio', false, 3),
  ('eeeeeeee-0004-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004', 'D', 'Hemoglobina', true, 4),
  ('eeeeeeee-0004-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000004', 'E', 'Mioglobina', false, 5),
  ('eeeeeeee-0005-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000005', 'A', 'Transcrição', false, 1),
  ('eeeeeeee-0005-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000005', 'B', 'Replicação', false, 2),
  ('eeeeeeee-0005-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000005', 'C', 'Splicing', false, 3),
  ('eeeeeeee-0005-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000005', 'D', 'Exportação', false, 4),
  ('eeeeeeee-0005-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005', 'E', 'Tradução', true, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.questao_tema (questao_id, tema_id) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003'),
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;;
