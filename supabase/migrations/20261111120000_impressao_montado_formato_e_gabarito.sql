-- Impressão do simulado montado ("Apenas imprimir" em /dashboard/simulados/montar).
--
-- gerar_simulado_impressao tinha ficado para trás de gerar_simulado_personalizado:
--
-- 1) Ignorava o formato da questão (Objetivas/Discursivas/Misto). Quem pedia só
--    discursivas recebia o acervo inteiro misturado.
-- 2) Não deduplicava por grupo_equivalencia_id: a fechada e a sua gêmea
--    discursiva podiam sair no mesmo simulado.
-- 3) Exigia imagem_url em laboratório, contrariando a regra de que a contagem
--    por tema (listar_temas_com_contagem) e o gerador aplicam os mesmos filtros.
-- 4) Nunca devolvia gabarito, e a tela prometia "Disponível após finalizar a
--    prova" para um simulado que não vira prova nem tentativa. Decisão de
--    produto (11/11/2026): a impressão do montado é exclusiva do Avançado, que
--    já vê o gabarito de qualquer questão do acervo no modo estudo e na
--    revisão; com p_com_gabarito = true a RPC devolve correta, explicação,
--    referência, resposta_modelo e pontos_chave.
--
-- A assinatura muda (novos parâmetros), então a versão de 4 argumentos sai.
-- Os defaults mantêm compatível o cliente antigo em cache: sem os parâmetros
-- novos ele recebe objetivas sem gabarito.

DROP FUNCTION IF EXISTS public.gerar_simulado_impressao(uuid[], integer, text, text);

CREATE OR REPLACE FUNCTION public.gerar_simulado_impressao(
  p_tema_ids uuid[] DEFAULT NULL::uuid[],
  p_qtd integer DEFAULT 10,
  p_tipo_questao text DEFAULT NULL::text,
  p_formato text DEFAULT NULL::text,
  p_formato_questao text DEFAULT 'fechadas'::text,
  p_com_gabarito boolean DEFAULT false
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
  v_com_gab boolean := coalesce(p_com_gabarito, false);
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

  IF p_formato_questao IS NULL OR p_formato_questao NOT IN ('fechadas', 'discursivas', 'misto') THEN
    RAISE EXCEPTION 'Formato de questao invalido: %', p_formato_questao USING ERRCODE = 'P0010';
  END IF;

  -- Mesma seleção de gerar_simulado_personalizado: filtro de formato da
  -- questão, uma questão por grupo de equivalência e prioridade para grupos
  -- ainda não entregues ao aluno.
  SELECT array(
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
        AND (
          p_formato IS NULL
          OR p_formato = 'laboratorio'
          OR q.formato_prova IS NULL
          OR q.formato_prova = p_formato
          OR (q.formato_prova IN ('N1', 'N2', 'teste_progresso', 'integradora') AND p_formato = 'nacional')
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
      'resposta_modelo', CASE WHEN v_com_gab THEN q.resposta_modelo END,
      'pontos_chave', CASE WHEN v_com_gab THEN coalesce(q.pontos_chave, '[]'::jsonb) ELSE '[]'::jsonb END,
      'tipo_questao', q.tipo_questao,
      'explicacao', CASE WHEN v_com_gab THEN q.explicacao END,
      'referencia', CASE WHEN v_com_gab THEN q.referencia END,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN v_com_gab THEN a.correta END,
          'ordem', a.ordem, 'imagem_url', a.imagem_url
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
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'gabarito_liberado', v_com_gab
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gerar_simulado_impressao(uuid[], integer, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_impressao(uuid[], integer, text, text, text, boolean) TO authenticated, service_role;
