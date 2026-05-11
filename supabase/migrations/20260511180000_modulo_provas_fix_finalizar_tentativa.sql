-- Fix 1: finalizar_tentativa is now idempotent — when already finalized,
--         rebuilds and returns the stored result instead of raising P0005.
-- Fix 2: distribuicao_temas now returns { tema: { id, nome, ... }, total, acertos }
--         matching the TypeScript DistribuicaoTema interface.

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

  SELECT * INTO v_tentativa
  FROM tentativa
  WHERE id = p_tentativa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003';
  END IF;

  -- Only perform finalization writes when not already finalized (idempotent path)
  IF v_tentativa.status != 'finalizada' THEN
    -- Mark each answer as correct/incorrect
    UPDATE tentativa_resposta tr
    SET correta = (
      tr.alternativa_id IS NOT NULL
      AND tr.alternativa_id = (
        SELECT a.id FROM alternativa a
        WHERE a.questao_id = tr.questao_id AND a.correta = true
        LIMIT 1
      )
    )
    WHERE tr.tentativa_id = p_tentativa_id;

    SELECT
      COUNT(*) FILTER (WHERE tr.correta = true),
      COUNT(*) FILTER (WHERE tr.respondida_em IS NOT NULL)
    INTO v_acertos, v_total_respondidas
    FROM tentativa_resposta tr
    WHERE tr.tentativa_id = p_tentativa_id;

    v_nota := ROUND(
      (v_acertos::NUMERIC / NULLIF(v_tentativa.total_questoes, 0)) * 100,
      1
    );

    UPDATE tentativa
    SET status            = 'finalizada',
        finalizada_em     = NOW(),
        acertos           = v_acertos,
        total_respondidas = v_total_respondidas,
        nota              = v_nota
    WHERE id = p_tentativa_id
    RETURNING * INTO v_tentativa;

    UPDATE questao q
    SET vezes_respondida = q.vezes_respondida + 1,
        vezes_acertada   = q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END,
        taxa_acerto      = ROUND(
          ((q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END)::NUMERIC
           / (q.vezes_respondida + 1)) * 100,
          2
        )
    FROM tentativa_resposta tr
    WHERE tr.tentativa_id = p_tentativa_id
      AND tr.questao_id = q.id
      AND tr.respondida_em IS NOT NULL;
  END IF;

  -- Build questoes (with correta exposed, since tentativa is now finalized)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              q.id,
      'prova_id',        q.prova_id,
      'ordem_na_prova',  q.ordem_na_prova,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado',       q.enunciado,
      'imagem_url',      q.imagem_url,
      'imagem_legenda',  q.imagem_legenda,
      'formato',         q.formato,
      'explicacao',      q.explicacao,
      'dificuldade',     q.dificuldade,
      'disciplina',      q.disciplina,
      'periodo',         q.periodo,
      'status',          q.status,
      'criado_em',       q.criado_em,
      'atualizado_em',   q.atualizado_em,
      'alternativas', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',         a.id,
            'questao_id', a.questao_id,
            'letra',      a.letra,
            'texto',      a.texto,
            'correta',    a.correta,
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
            'periodo',    t.periodo
          )
        )
        FROM questao_tema qt
        JOIN tema t ON t.id = qt.tema_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY q.ordem_na_prova
  )
  INTO v_questoes
  FROM questao q
  WHERE q.prova_id = v_tentativa.prova_id AND q.status = 'ativa';

  -- Build respostas
  SELECT jsonb_agg(row_to_json(tr)::jsonb ORDER BY tr.id)
  INTO v_respostas
  FROM tentativa_resposta tr
  WHERE tr.tentativa_id = p_tentativa_id;

  -- Build distribuicao_temas with nested tema object (matches DistribuicaoTema TS interface)
  SELECT jsonb_agg(
    jsonb_build_object(
      'tema', jsonb_build_object(
                'id',         sub.tema_id,
                'nome',       sub.tema_nome,
                'disciplina', sub.tema_disciplina,
                'periodo',    sub.tema_periodo,
                'parent_id',  null,
                'criado_em',  null
              ),
      'total',   sub.total,
      'acertos', sub.acertos
    )
  )
  INTO v_distribuicao
  FROM (
    SELECT
      t.id         AS tema_id,
      t.nome       AS tema_nome,
      t.disciplina AS tema_disciplina,
      t.periodo    AS tema_periodo,
      COUNT(tr.id)                                  AS total,
      COUNT(tr.id) FILTER (WHERE tr.correta = true) AS acertos
    FROM tentativa_resposta tr
    JOIN questao_tema qt ON qt.questao_id = tr.questao_id
    JOIN tema t ON t.id = qt.tema_id
    WHERE tr.tentativa_id = p_tentativa_id
    GROUP BY t.id, t.nome, t.disciplina, t.periodo
  ) sub;

  v_result := jsonb_build_object(
    'tentativa',          row_to_json(v_tentativa)::jsonb,
    'questoes',           COALESCE(v_questoes, '[]'::jsonb),
    'respostas',          COALESCE(v_respostas, '[]'::jsonb),
    'distribuicao_temas', COALESCE(v_distribuicao, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$
;
