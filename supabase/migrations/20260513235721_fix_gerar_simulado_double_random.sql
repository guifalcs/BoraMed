CREATE OR REPLACE FUNCTION public.gerar_simulado_personalizado(
  p_tema_ids uuid[] DEFAULT NULL::uuid[],
  p_qtd integer DEFAULT 10,
  p_modo text DEFAULT 'simulado'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id       UUID;
  v_prova_id      UUID;
  v_tentativa     RECORD;
  v_questoes      JSONB;
  v_total         INT;
  v_result        JSONB;
  v_nome          TEXT;
  v_selected_ids  UUID[];
BEGIN
  -- Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  -- Validação modo
  IF p_modo NOT IN ('simulado', 'estudo') THEN
    RAISE EXCEPTION 'Modo inválido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  -- Validação quantidade
  IF p_qtd < 1 OR p_qtd > 50 THEN
    RAISE EXCEPTION 'Quantidade deve ser entre 1 e 50' USING ERRCODE = 'P0006';
  END IF;

  -- Seleciona questões UMA VEZ e armazena IDs
  SELECT ARRAY(
    SELECT DISTINCT q.id
    FROM questao q
    WHERE q.status = 'ativa'
      AND (
        p_tema_ids IS NULL
        OR array_length(p_tema_ids, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM questao_tema qt
          WHERE qt.questao_id = q.id AND qt.tema_id = ANY(p_tema_ids)
        )
      )
    ORDER BY random()
    LIMIT p_qtd
  ) INTO v_selected_ids;

  v_total := array_length(v_selected_ids, 1);

  IF v_total IS NULL OR v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questão encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  -- Gera nome descritivo
  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := 'Simulado personalizado — ' || v_total || ' questões';
  ELSE
    SELECT 'Simulado — ' || string_agg(t.nome, ', ' ORDER BY t.nome) || ' — ' || v_total || 'q'
    INTO v_nome
    FROM tema t
    WHERE t.id = ANY(p_tema_ids);
  END IF;

  -- Trunca nome se muito longo
  IF length(v_nome) > 200 THEN
    v_nome := left(v_nome, 197) || '...';
  END IF;

  -- Cria prova processual (agrupadora)
  INSERT INTO prova (faculdade_id, nome, periodo, tipo, qtd_questoes, edicao)
  VALUES (NULL, v_nome, 0, 'processual', v_total, 0)
  RETURNING id INTO v_prova_id;

  -- Cria tentativa
  INSERT INTO tentativa (
    user_id, prova_id, modo, status,
    total_questoes, total_respondidas, acertos,
    iniciada_em, criado_em
  )
  VALUES (
    v_user_id, v_prova_id, p_modo, 'em_andamento',
    v_total, 0, 0,
    NOW(), NOW()
  )
  RETURNING * INTO v_tentativa;

  -- Cria registros de resposta para cada questão selecionada
  INSERT INTO tentativa_resposta (tentativa_id, questao_id)
  SELECT v_tentativa.id, unnest(v_selected_ids);

  -- Monta questões com alternativas
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                      q.id,
      'prova_id',                q.prova_id,
      'ordem_na_prova',          q.ordem_na_prova,
      'codigo_externo',          q.codigo_externo,
      'enunciado_apoio',         q.enunciado_apoio,
      'enunciado',               q.enunciado,
      'imagem_url',              q.imagem_url,
      'imagem_legenda',          q.imagem_legenda,
      'formato',                 q.formato,
      'explicacao',              q.explicacao,
      'dificuldade',             q.dificuldade,
      'disciplina',              q.disciplina,
      'periodo',                 q.periodo,
      'status',                  q.status,
      'criado_em',               q.criado_em,
      'atualizado_em',           q.atualizado_em,
      'alternativas', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',         a.id,
            'questao_id', a.questao_id,
            'letra',      a.letra,
            'texto',      a.texto,
            'correta',    CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
            'ordem',      a.ordem,
            'imagem_url', a.imagem_url
          ) ORDER BY a.ordem
        )
        FROM alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',         t.id,
            'nome',       t.nome,
            'disciplina', t.disciplina,
            'periodo',    t.periodo,
            'parent_id',  t.parent_id,
            'criado_em',  t.criado_em
          )
        )
        FROM questao_tema qt2
        JOIN tema t ON t.id = qt2.tema_id
        WHERE qt2.questao_id = q.id
      )
    )
  )
  INTO v_questoes
  FROM questao q
  WHERE q.id = ANY(v_selected_ids);

  v_result := jsonb_build_object(
    'prova_id',   v_prova_id,
    'tentativa',  row_to_json(v_tentativa)::jsonb,
    'questoes',   COALESCE(v_questoes, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;;
