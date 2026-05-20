-- Remove dificuldade from questao and ano/semestre/edicao/tempo_sugerido_minutos from prova.
-- Updates all RPCs before dropping columns so they remain valid.

-- ─────────────────────────────────────────────────────────────────
-- 1. Update RPCs (remove dificuldade from JSON output, remove edicao from prova INSERT)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.iniciar_tentativa(p_prova_id uuid, p_modo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_prova record;
  v_tentativa record;
  v_questoes jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo', 'visualizar') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  SELECT p.*, count(pq.questao_id) FILTER (WHERE q.status = 'ativa') AS total
  INTO v_prova
  FROM public.prova p
  LEFT JOIN public.prova_questao pq ON pq.prova_id = p.id
  LEFT JOIN public.questao q ON q.id = pq.questao_id
  WHERE p.id = p_prova_id
  GROUP BY p.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova nao encontrada' USING ERRCODE = 'P0003';
  END IF;

  IF v_prova.total = 0 THEN
    RAISE EXCEPTION 'A prova nao possui questoes ativas' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, q.id, row_number() OVER (ORDER BY pq.ordem, q.id)::integer
  FROM public.prova_questao pq
  JOIN public.questao q ON q.id = pq.questao_id
  WHERE pq.prova_id = p_prova_id
    AND q.status = 'ativa'
  ORDER BY pq.ordem, q.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', p_prova_id,
      'ordem_na_prova', tr.ordem_na_tentativa,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY tr.ordem_na_tentativa
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = v_tentativa.id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.retomar_tentativa(p_tentativa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_tentativa record;
  v_questoes jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa nao encontrada ou sem permissao' USING ERRCODE = 'P0003';
  END IF;

  IF v_tentativa.status = 'finalizada' THEN
    RAISE EXCEPTION 'Tentativa ja finalizada' USING ERRCODE = 'P0005';
  END IF;

  UPDATE public.tentativa
  SET status = 'em_andamento',
      pausada_em = NULL
  WHERE id = p_tentativa_id
  RETURNING * INTO v_tentativa;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = p_tentativa_id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.finalizar_tentativa(uuid);

CREATE OR REPLACE FUNCTION public.finalizar_tentativa(
  p_tentativa_id uuid,
  p_tempo_segundos integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_tentativa record;
  v_acertos integer;
  v_total_respondidas integer;
  v_nota numeric(5,2);
  v_questoes jsonb;
  v_respostas jsonb;
  v_distribuicao jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa nao encontrada ou sem permissao' USING ERRCODE = 'P0003';
  END IF;

  IF v_tentativa.status <> 'finalizada' THEN
    UPDATE public.tentativa_resposta tr
    SET correta = (
      tr.alternativa_id IS NOT NULL
      AND tr.alternativa_id = (
        SELECT a.id
        FROM public.alternativa a
        WHERE a.questao_id = tr.questao_id
          AND a.correta = TRUE
        ORDER BY a.ordem
        LIMIT 1
      )
    )
    WHERE tr.tentativa_id = p_tentativa_id;

    SELECT
      count(*) FILTER (WHERE tr.correta = TRUE),
      count(*) FILTER (WHERE tr.respondida_em IS NOT NULL)
    INTO v_acertos, v_total_respondidas
    FROM public.tentativa_resposta tr
    WHERE tr.tentativa_id = p_tentativa_id;

    v_nota := round((v_acertos::numeric / nullif(v_tentativa.total_questoes, 0)) * 100, 1);

    UPDATE public.tentativa
    SET status = 'finalizada',
        finalizada_em = now(),
        acertos = v_acertos,
        total_respondidas = v_total_respondidas,
        nota = v_nota,
        tempo_acumulado_segundos = coalesce(p_tempo_segundos, tempo_acumulado_segundos)
    WHERE id = p_tentativa_id
    RETURNING * INTO v_tentativa;

    UPDATE public.questao q
    SET vezes_respondida = q.vezes_respondida + 1,
        vezes_acertada = q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END,
        taxa_acerto = round(
          ((q.vezes_acertada + CASE WHEN tr.correta THEN 1 ELSE 0 END)::numeric
            / (q.vezes_respondida + 1)) * 100,
          2
        )
    FROM public.tentativa_resposta tr
    WHERE tr.tentativa_id = p_tentativa_id
      AND tr.questao_id = q.id
      AND tr.respondida_em IS NOT NULL;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', a.correta,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = p_tentativa_id;

  SELECT jsonb_agg(row_to_json(tr)::jsonb ORDER BY coalesce(tr.ordem_na_tentativa, 2147483647), tr.id)
  INTO v_respostas
  FROM public.tentativa_resposta tr
  WHERE tr.tentativa_id = p_tentativa_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'tema', jsonb_build_object(
        'id', sub.tema_id,
        'nome', sub.tema_nome,
        'disciplina_id', sub.disciplina_id,
        'disciplina', sub.disciplina_sigla,
        'periodo', sub.disciplina_periodo,
        'parent_id', sub.parent_id,
        'criado_em', sub.criado_em
      ),
      'total', sub.total,
      'acertos', sub.acertos
    )
    ORDER BY sub.tema_nome
  )
  INTO v_distribuicao
  FROM (
    SELECT
      t.id AS tema_id,
      t.nome AS tema_nome,
      t.disciplina_id,
      d.sigla AS disciplina_sigla,
      d.periodo::integer AS disciplina_periodo,
      t.parent_id,
      t.criado_em,
      count(tr.id)::integer AS total,
      count(tr.id) FILTER (WHERE tr.correta = TRUE)::integer AS acertos
    FROM public.tentativa_resposta tr
    JOIN public.questao_tema qt ON qt.questao_id = tr.questao_id
    JOIN public.tema t ON t.id = qt.tema_id
    LEFT JOIN public.disciplina d ON d.id = t.disciplina_id
    WHERE tr.tentativa_id = p_tentativa_id
    GROUP BY t.id, t.nome, t.disciplina_id, d.sigla, d.periodo, t.parent_id, t.criado_em
  ) sub;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'respostas', coalesce(v_respostas, '[]'::jsonb),
    'distribuicao_temas', coalesce(v_distribuicao, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_simulado_personalizado(
  p_tema_ids uuid[] DEFAULT NULL::uuid[],
  p_qtd integer DEFAULT 10,
  p_modo text DEFAULT 'simulado'::text,
  p_tipo_questao text DEFAULT NULL::text,
  p_formato text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_prova_id uuid;
  v_tentativa record;
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  IF p_qtd < 1 OR p_qtd > 50 THEN
    RAISE EXCEPTION 'Quantidade deve ser entre 1 e 50' USING ERRCODE = 'P0006';
  END IF;

  IF p_tipo_questao IS NOT NULL AND p_tipo_questao NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Tipo de questao invalido: %', p_tipo_questao USING ERRCODE = 'P0007';
  END IF;

  IF p_formato IS NOT NULL AND p_formato NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Formato invalido: %', p_formato USING ERRCODE = 'P0008';
  END IF;

  SELECT array(
    WITH questoes_entregues AS (
      SELECT DISTINCT tr.questao_id
      FROM public.tentativa t
      JOIN public.tentativa_resposta tr ON tr.tentativa_id = t.id
      WHERE t.user_id = v_user_id
        AND t.modo <> 'visualizar'
    )
    SELECT q.id
    FROM public.questao q
    LEFT JOIN questoes_entregues qe ON qe.questao_id = q.id
    WHERE q.status = 'ativa'
      AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
      AND (p_tipo_questao IS DISTINCT FROM 'laboratorio' OR q.imagem_url IS NOT NULL)
      AND (
        p_formato IS NULL
        OR p_formato = 'laboratorio'
        OR q.formato_prova IS NULL
        OR q.formato_prova = p_formato
        OR (q.formato_prova IN ('N1', 'N2', 'teste_progresso') AND p_formato = 'nacional')
      )
      AND (
        p_tema_ids IS NULL
        OR array_length(p_tema_ids, 1) IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.questao_tema qt
          WHERE qt.questao_id = q.id
            AND qt.tema_id = ANY(p_tema_ids)
        )
      )
    ORDER BY (qe.questao_id IS NOT NULL) ASC, random()
    LIMIT p_qtd
  )
  INTO v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := CASE
      WHEN p_formato IS NULL THEN 'Simulado personalizado - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
      WHEN p_formato IS NULL THEN 'Simulado - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado - '
    END || string_agg(t.nome, ', ' ORDER BY t.nome) || ' - ' || v_total || 'q'
    INTO v_nome
    FROM public.tema t
    WHERE t.id = ANY(p_tema_ids);
  END IF;

  IF length(v_nome) > 200 THEN
    v_nome := left(v_nome, 197) || '...';
  END IF;

  INSERT INTO public.prova (
    faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo,
    qtd_questoes, publicada, arquivada
  )
  VALUES (
    NULL, v_nome, 0, 'autoral', 'personalizado', p_formato, NULL, NULL,
    v_total, FALSE, FALSE
  )
  RETURNING id INTO v_prova_id;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, v_prova_id, p_modo, 'em_andamento', v_total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, selected.questao_id, selected.ordem::integer
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_prova_id,
      'ordem_na_prova', selected.ordem::integer,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'tipo_questao', q.tipo_questao,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY selected.ordem
  )
  INTO v_questoes
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem)
  JOIN public.questao q ON q.id = selected.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id;

  RETURN jsonb_build_object(
    'prova_id', v_prova_id,
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.retomar_tentativa(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.retomar_tentativa(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.retomar_tentativa(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finalizar_tentativa(uuid, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.finalizar_tentativa(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalizar_tentativa(uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2. Drop unique index (depends on edicao column, must drop before column)
-- ─────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.prova_tipo_periodo_edicao_unique;

-- ─────────────────────────────────────────────────────────────────
-- 3. Drop columns from questao and prova
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.questao DROP COLUMN IF EXISTS dificuldade;

ALTER TABLE public.prova DROP COLUMN IF EXISTS ano;
ALTER TABLE public.prova DROP COLUMN IF EXISTS semestre;
ALTER TABLE public.prova DROP COLUMN IF EXISTS edicao;
ALTER TABLE public.prova DROP COLUMN IF EXISTS tempo_sugerido_minutos;
