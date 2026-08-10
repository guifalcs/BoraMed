-- =============================================================================
-- Free tier — fecha o bypass do teto pelo modo `visualizar`
-- =============================================================================
-- 20260801115817 isentou `visualizar` do teto de tentativas (a intenção era não
-- cobrar crédito por revisão). Só que `visualizar` devolve o payload COM
-- gabarito (`correta`), explicação e resposta modelo: uma conta gratuita, mesmo
-- com 0 restantes, extraía o acervo nacional inteiro chamando a RPC direto,
-- sem limite. Antes do free tier isso era protegido porque `iniciar_tentativa`
-- exigia assinatura ativa (P0009) em qualquer modo.
--
-- Agora, no nível gratuito, `visualizar` só vale para prova que o aluno já
-- finalizou — a mesma regra que `get_revisao_prova` (P0005) e o `v_liberado` de
-- `get_simulado_impressao` já aplicam. Níveis pagos seguem inalterados.
--
-- A UI não usa este caminho: a revisão passa por `get_revisao_prova`
-- (`TentativaService.prepararVisualizacao`), que já tinha a trava.
--
-- Nenhum GRANT a reescrever: `CREATE OR REPLACE` preserva os de 20260801115817.
-- =============================================================================

set check_function_bodies = off;

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
  v_nivel text;
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

  v_nivel := public.nivel_acesso();

  -- Gratuito e essencial só acessam treinos de formato nacional.
  IF v_nivel IN ('gratuito', 'essencial') AND v_prova.formato IS DISTINCT FROM 'nacional' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
  END IF;

  -- Teto vitalício do plano gratuito. Debita ao iniciar, sem estorno; retomar
  -- uma tentativa pausada usa outra RPC e por isso nunca debita de novo.
  IF v_nivel = 'gratuito'
     AND p_modo <> 'visualizar'
     AND public.tentativas_gratuitas_restantes() <= 0 THEN
    RAISE EXCEPTION 'free_limit_reached: limite de tentativas do plano gratuito atingido' USING ERRCODE = 'P0016';
  END IF;

  -- Modo visualizar entrega gabarito, explicacoes e resposta modelo sem debitar
  -- credito. No plano gratuito isso so vale para prova que o aluno JA finalizou
  -- — mesma regra de get_revisao_prova (P0005) e do v_liberado de
  -- get_simulado_impressao. Sem esta trava, uma conta gratuita mesmo esgotada
  -- extraia o acervo nacional inteiro COM gabarito, sem limite, chamando a RPC
  -- direto. A UI nunca usa este caminho: a revisao vai por get_revisao_prova.
  IF v_nivel = 'gratuito'
     AND p_modo = 'visualizar'
     AND NOT EXISTS (
       SELECT 1
       FROM public.tentativa t
       WHERE t.user_id = v_user_id
         AND t.prova_id = p_prova_id
         AND t.status = 'finalizada'
         AND t.modo <> 'visualizar'
     ) THEN
    RAISE EXCEPTION 'Revisao disponivel apenas apos finalizar a prova' USING ERRCODE = 'P0005';
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
      'recurso_texto', q.recurso_texto,
      'anulada', q.anulada,
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
$function$
;


