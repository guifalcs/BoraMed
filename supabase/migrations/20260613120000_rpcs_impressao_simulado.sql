-- Impressão de simulados (prontos e montados).
--
-- 1) get_simulado_impressao: devolve as questões de uma prova para impressão.
--    O gabarito (correta/explicacao) só é exposto quando p_com_gabarito = true E
--    o aluno já finalizou aquela prova (ou é admin) — preserva a regra de
--    segurança da migration 20260609130000 (colunas de resposta revogadas).
--    Cobre provas prontas (via prova_questao) e simulados montados já existentes
--    (via tentativa_resposta da tentativa mais recente do usuário).
--
-- 2) gerar_simulado_impressao: sorteia questões para impressão SEM criar
--    prova/tentativa (histórico limpo) e SEM expor gabarito. Espelha a seleção
--    aleatória/filtros da versão atual de gerar_simulado_personalizado.

-- ─────────────────────────────────────────────────────────────────
-- 1. get_simulado_impressao
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_simulado_impressao(
  p_prova_id uuid,
  p_com_gabarito boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_liberado boolean;
  v_com_gab boolean;
  v_tem_junction boolean;
  v_tentativa_id uuid;
  v_prova record;
  v_questoes jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_is_admin := public.is_admin(v_user_id);

  SELECT p.id, p.nome, p.qtd_questoes, p.periodo, p.formato
  INTO v_prova
  FROM public.prova p
  WHERE p.id = p_prova_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova nao encontrada' USING ERRCODE = 'P0003';
  END IF;

  -- Gabarito liberado: já finalizou uma tentativa real desta prova, ou é admin.
  v_liberado := v_is_admin OR EXISTS (
    SELECT 1
    FROM public.tentativa t
    WHERE t.user_id = v_user_id
      AND t.prova_id = p_prova_id
      AND t.status = 'finalizada'
      AND t.modo <> 'visualizar'
  );

  v_com_gab := COALESCE(p_com_gabarito, false) AND v_liberado;

  v_tem_junction := EXISTS (
    SELECT 1 FROM public.prova_questao pq WHERE pq.prova_id = p_prova_id
  );

  IF v_tem_junction THEN
    -- Prova pronta: questões ativas ordenadas pela junção.
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prova_id', p_prova_id,
        'ordem_na_prova', pq.ordem,
        'codigo_externo', q.codigo_externo,
        'enunciado_apoio', q.enunciado_apoio,
        'enunciado', q.enunciado,
        'imagem_url', q.imagem_url,
        'imagem_legenda', q.imagem_legenda,
        'formato', q.formato,
        'tipo_questao', q.tipo_questao,
        'explicacao', CASE WHEN v_com_gab THEN q.explicacao ELSE NULL END,
        'referencia', CASE WHEN v_com_gab THEN q.referencia ELSE NULL END,
        'disciplina', d.sigla,
        'periodo', d.periodo::integer,
        'status', q.status,
        'criado_em', q.criado_em,
        'atualizado_em', q.atualizado_em,
        'alternativas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
            'texto', a.texto,
            'correta', CASE WHEN v_com_gab THEN a.correta ELSE NULL END,
            'ordem', a.ordem, 'imagem_url', a.imagem_url
          ) ORDER BY a.ordem), '[]'::jsonb)
          FROM public.alternativa a WHERE a.questao_id = q.id
        ),
        'temas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
            'disciplina', td.sigla, 'periodo', td.periodo::integer,
            'parent_id', t.parent_id, 'criado_em', t.criado_em
          ) ORDER BY t.nome), '[]'::jsonb)
          FROM public.questao_tema qt
          JOIN public.tema t ON t.id = qt.tema_id
          LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
          WHERE qt.questao_id = q.id
        )
      )
      ORDER BY pq.ordem, q.id
    )
    INTO v_questoes
    FROM public.prova_questao pq
    JOIN public.questao q ON q.id = pq.questao_id
    LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
    WHERE pq.prova_id = p_prova_id
      AND q.status = 'ativa';
  ELSE
    -- Simulado montado (sem junção): tentativa mais recente do usuário.
    SELECT t.id
    INTO v_tentativa_id
    FROM public.tentativa t
    WHERE t.user_id = v_user_id
      AND t.prova_id = p_prova_id
      AND t.modo <> 'visualizar'
    ORDER BY t.criado_em DESC
    LIMIT 1;

    IF v_tentativa_id IS NOT NULL THEN
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
          'tipo_questao', q.tipo_questao,
          'explicacao', CASE WHEN v_com_gab THEN q.explicacao ELSE NULL END,
          'referencia', CASE WHEN v_com_gab THEN q.referencia ELSE NULL END,
          'disciplina', d.sigla,
          'periodo', d.periodo::integer,
          'status', q.status,
          'criado_em', q.criado_em,
          'atualizado_em', q.atualizado_em,
          'alternativas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
              'texto', a.texto,
              'correta', CASE WHEN v_com_gab THEN a.correta ELSE NULL END,
              'ordem', a.ordem, 'imagem_url', a.imagem_url
            ) ORDER BY a.ordem), '[]'::jsonb)
            FROM public.alternativa a WHERE a.questao_id = q.id
          ),
          'temas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
              'disciplina', td.sigla, 'periodo', td.periodo::integer,
              'parent_id', t.parent_id, 'criado_em', t.criado_em
            ) ORDER BY t.nome), '[]'::jsonb)
            FROM public.questao_tema qt
            JOIN public.tema t ON t.id = qt.tema_id
            LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
            WHERE qt.questao_id = q.id
          )
        )
        ORDER BY coalesce(tr.ordem_na_tentativa, 2147483647), tr.id
      )
      INTO v_questoes
      FROM public.tentativa_resposta tr
      JOIN public.questao q ON q.id = tr.questao_id
      LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
      WHERE tr.tentativa_id = v_tentativa_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'prova', jsonb_build_object(
      'id', v_prova.id,
      'nome', v_prova.nome,
      'qtd_questoes', v_prova.qtd_questoes,
      'periodo', v_prova.periodo,
      'formato', v_prova.formato
    ),
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'gabarito_liberado', v_liberado
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_simulado_impressao(uuid, boolean) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_simulado_impressao(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_simulado_impressao(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2. gerar_simulado_impressao
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gerar_simulado_impressao(
  p_tema_ids uuid[] DEFAULT NULL::uuid[],
  p_qtd integer DEFAULT 10,
  p_tipo_questao text DEFAULT NULL::text,
  p_formato text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
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

  -- Mesma seleção da geração normal (prioriza questões ainda não entregues).
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
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
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

  -- Monta as questões SEM gabarito (correta/explicacao nulos).
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', NULL,
      'ordem_na_prova', selected.ordem::integer,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'tipo_questao', q.tipo_questao,
      'explicacao', NULL,
      'referencia', NULL,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
          'texto', a.texto, 'correta', NULL, 'ordem', a.ordem, 'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla, 'periodo', td.periodo::integer,
          'parent_id', t.parent_id, 'criado_em', t.criado_em
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
    'nome', v_nome,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gerar_simulado_impressao(uuid[], integer, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.gerar_simulado_impressao(uuid[], integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_impressao(uuid[], integer, text, text) TO authenticated;
