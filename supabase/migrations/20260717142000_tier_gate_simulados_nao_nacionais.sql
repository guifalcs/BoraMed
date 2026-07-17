-- ============================================================================
-- Plano Essencial: geração/impressão de simulados personalizados (que podem
-- cobrir qualquer formato de prova) ficam restritas ao tier 'avancado'.
-- iniciar_tentativa/get_simulado_impressao (provas PRONTAS, com prova_questao)
-- seguem liberadas para o tier 'essencial' quando a prova é formato='nacional'
-- — é exatamente o conteúdo que o plano Essencial vende.
--
-- Bases usadas (versão vigente antes desta migration):
--   - gerar_simulado_personalizado: 20260708140000_sorteio_dedup_e_rodizio_grupo.sql
--   - iniciar_tentativa: 20260707130000_abertas_rpcs_resposta_e_nota_pontos.sql
--   - gerar_simulado_impressao / get_simulado_impressao:
--     20260707160000_abertas_transversais.sql
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1) gerar_simulado_personalizado — bloqueio incondicional para essencial
-- ------------------------------------------------------------------
create or replace function public.gerar_simulado_personalizado(
  p_tema_ids uuid[] default null,
  p_qtd integer default 10,
  p_modo text default 'simulado',
  p_tipo_questao text default null,
  p_formato text default null,
  p_formato_questao text default 'fechadas'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  IF public.assinatura_tier() = 'essencial' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
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

  IF p_formato_questao NOT IN ('fechadas', 'discursivas', 'misto') THEN
    RAISE EXCEPTION 'Formato de questao invalido: %', p_formato_questao USING ERRCODE = 'P0010';
  END IF;

  SELECT array(
    -- Grupos lógicos já entregues ao aluno (por coalesce(grupo, id)) em tentativas
    -- reais. Trata fechada e discursiva gêmeas como a MESMA questão lógica.
    WITH grupos_entregues AS (
      SELECT DISTINCT coalesce(q2.grupo_equivalencia_id, q2.id) AS grupo
      FROM public.tentativa t
      JOIN public.tentativa_resposta tr ON tr.tentativa_id = t.id
      JOIN public.questao q2 ON q2.id = tr.questao_id
      WHERE t.user_id = v_user_id
        AND t.modo <> 'visualizar'
    ),
    candidatas AS (
      SELECT q.id, coalesce(q.grupo_equivalencia_id, q.id) AS grupo
      FROM public.questao q
      WHERE q.status = 'ativa'
        AND (
          (p_formato_questao = 'fechadas' AND q.formato <> 'resposta_aberta_curta')
          OR (p_formato_questao = 'discursivas' AND q.formato = 'resposta_aberta_curta')
          OR p_formato_questao = 'misto'
        )
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
    ),
    -- Uma variante por grupo (dedup), escolhida ao acaso dentro do grupo.
    por_grupo AS (
      SELECT c.id,
             (ge.grupo IS NOT NULL) AS entregue,
             row_number() OVER (PARTITION BY c.grupo ORDER BY random()) AS rn
      FROM candidatas c
      LEFT JOIN grupos_entregues ge ON ge.grupo = c.grupo
    )
    SELECT id
    FROM por_grupo
    WHERE rn = 1
    ORDER BY entregue ASC, random()
    LIMIT p_qtd
  )
  INTO v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := CASE
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
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
      'resposta_modelo', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN p_modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
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
$$;

revoke all on function public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text) from public, anon;
grant execute on function public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------
-- 2) iniciar_tentativa — bloqueio condicional (essencial + prova não nacional)
-- ------------------------------------------------------------------
create or replace function public.iniciar_tentativa(p_prova_id uuid, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
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

  -- Tier essencial só acessa treinos de formato nacional.
  IF public.assinatura_tier() = 'essencial' AND v_prova.formato IS DISTINCT FROM 'nacional' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
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
      'resposta_modelo', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN p_modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
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
$$;

revoke all on function public.iniciar_tentativa(uuid, text) from public, anon;
grant execute on function public.iniciar_tentativa(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 3) get_simulado_impressao — bloqueio condicional só na prova PRONTA
--    (junção prova_questao). O branch de reimpressão do simulado
--    personalizado do próprio usuário (sem junção) não é gateado — é
--    conteúdo que ele mesmo já gerou.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_simulado_impressao(p_prova_id uuid, p_com_gabarito boolean DEFAULT false)
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

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
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
    -- Tier essencial só imprime treinos de formato nacional.
    IF public.assinatura_tier() = 'essencial' AND v_prova.formato IS DISTINCT FROM 'nacional' THEN
      RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
    END IF;

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
        'resposta_modelo', CASE WHEN v_com_gab THEN q.resposta_modelo END,
        'pontos_chave', CASE WHEN v_com_gab THEN coalesce(q.pontos_chave, '[]'::jsonb) ELSE '[]'::jsonb END,
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
        'resposta_modelo', CASE WHEN v_com_gab THEN q.resposta_modelo END,
        'pontos_chave', CASE WHEN v_com_gab THEN coalesce(q.pontos_chave, '[]'::jsonb) ELSE '[]'::jsonb END,
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

-- ------------------------------------------------------------------
-- 4) gerar_simulado_impressao — bloqueio incondicional para essencial
--    (mesma natureza "personalizado" do gerar_simulado_personalizado)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_simulado_impressao(p_tema_ids uuid[] DEFAULT NULL::uuid[], p_qtd integer DEFAULT 10, p_tipo_questao text DEFAULT NULL::text, p_formato text DEFAULT NULL::text)
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

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  IF public.assinatura_tier() = 'essencial' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
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
      'resposta_modelo', NULL,
      'pontos_chave', '[]'::jsonb,
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
