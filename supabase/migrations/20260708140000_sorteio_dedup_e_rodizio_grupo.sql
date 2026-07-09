-- ============================================================================
-- Sorteio ciente de equivalência: dedup abertas×fechadas + rodízio por grupo lógico
--
-- Substitui gerar_simulado_personalizado (base: 20260707140000). Duas mudanças:
--
--   1. DEDUP: nunca traz duas questões do mesmo grupo_equivalencia no mesmo
--      simulado (relevante sobretudo no formato 'misto', onde a fechada e a
--      discursiva gêmeas poderiam cair juntas). Uma variante por grupo, escolhida
--      ao acaso. Nos formatos 'fechadas'/'discursivas' o filtro de formato já deixa
--      no máximo uma variante por grupo, então a dedup é inócua ali.
--
--   2. RODÍZIO GROUP-AWARE: a anti-repetição passa a comparar por QUESTÃO LÓGICA
--      (coalesce(grupo_equivalencia_id, id)). Quem já fez a versão fechada é
--      despriorizado da discursiva gêmea e vice-versa — mais rodízio real.
--      Mantém-se SOFT (despriorização, não exclusão): o pool nunca seca.
--
-- Máscara de gabarito em modo simulado e grants: IDÊNTICOS à 20260707140000.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

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
