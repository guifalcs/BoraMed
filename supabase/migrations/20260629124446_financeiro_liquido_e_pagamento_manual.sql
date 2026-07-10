-- ============================================================
-- Correções e features do financeiro do admin. Três frentes:
--
-- A) Líquido das cobranças recorrentes: o endpoint authorized_payment do MP não
--    retorna o net_received_amount (líquido). Por isso os pagamentos mensais
--    ficavam com liquido_centavos NULL e sumiam de TODAS as métricas de
--    "Líquido", aparecendo só o semestral. O webhook passou a buscar o líquido
--    no pagamento real subjacente; aqui, a RPC usa o BRUTO como fallback quando
--    o líquido for desconhecido — assim nada fica de fora dos totais.
--
-- B) Pagamentos feitos POR FORA do Mercado Pago (ex.: PIX direto): assinaturas
--    ativadas manualmente nunca geravam registro em `pagamento`, então o
--    dinheiro real não aparecia na receita. Adiciona a RPC
--    admin_ativar_assinatura_manual (registra assinatura + pagamento manual) e
--    faz backfill das assinaturas pagas por fora.
--
-- C) Acesso de CORTESIA (grátis): coluna `assinatura.cortesia` marca acessos
--    liberados sem cobrança. Cortesias concedem acesso normalmente, mas ficam
--    FORA das métricas financeiras (receita, MRR, previsão, ativas pagantes) e
--    aparecem num indicador próprio. RPCs para liberar/revogar acesso gratuito.
-- ============================================================

-- C0) Marca de cortesia na assinatura ------------------------------------------
ALTER TABLE public.assinatura
  ADD COLUMN IF NOT EXISTS cortesia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assinatura.cortesia IS
  'true = acesso liberado de graça (sem cobrança). Fica fora das métricas financeiras.';

-- C0.1) Reclassifica o acesso semestral que foi liberado de graça (sem vínculo
-- com o MP e sem pagamento) como cortesia, para não virar receita no backfill.
UPDATE public.assinatura
   SET cortesia = true
 WHERE id = 'b47d4a10-610a-4ec1-88c8-3730abf050f1'
   AND mp_preapproval_id IS NULL
   AND mp_payment_id IS NULL;

-- A + C) Resumo financeiro -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_financeiro()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  inicio_mes timestamptz := date_trunc('month', now());
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT jsonb_build_object(
    -- Ativas PAGANTES (cortesia não conta como assinatura paga).
    'assinaturas_ativas', (
      SELECT count(*) FROM assinatura
      WHERE status = 'authorized' AND NOT cortesia
        AND (proxima_cobranca IS NULL OR proxima_cobranca > now())
    ),
    -- Acessos de cortesia ativos (visibilidade, fora do financeiro).
    'cortesias_ativas', (
      SELECT count(*) FROM assinatura
      WHERE status = 'authorized' AND cortesia
        AND (proxima_cobranca IS NULL OR proxima_cobranca > now())
    ),
    'assinaturas_canceladas',  (SELECT count(*) FROM assinatura WHERE status = 'cancelled'),
    'novas_no_mes',            (SELECT count(*) FROM assinatura WHERE status = 'authorized' AND NOT cortesia AND criado_em >= inicio_mes),
    'cancelamentos_no_mes',    (SELECT count(*) FROM assinatura WHERE cancelada_em >= inicio_mes),
    'mrr_centavos', COALESCE((
      SELECT sum(
        CASE
          WHEN p.frequency_type = 'months' THEN p.preco_centavos / GREATEST(p.frequency, 1)
          WHEN p.frequency_type = 'days'   THEN (p.preco_centavos * 30) / GREATEST(p.frequency, 1)
          ELSE p.preco_centavos
        END
      )
      FROM assinatura a JOIN plano p ON p.id = a.plano_id
      WHERE a.status = 'authorized' AND NOT a.cortesia AND p.recorrente
        AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now())
    ), 0),
    'previsao_30d_centavos', COALESCE((
      SELECT sum(p.preco_centavos)
      FROM assinatura a JOIN plano p ON p.id = a.plano_id
      WHERE a.status = 'authorized' AND NOT a.cortesia AND p.recorrente
        AND a.proxima_cobranca > now()
        AND a.proxima_cobranca <= now() + interval '30 days'
    ), 0),
    'receita_total_centavos', COALESCE((
      SELECT sum(valor_centavos) FROM pagamento WHERE status = 'approved'
    ), 0),
    'receita_mes_centavos', COALESCE((
      SELECT sum(valor_centavos) FROM pagamento
      WHERE status = 'approved' AND COALESCE(processado_em, criado_em) >= inicio_mes
    ), 0),
    -- Líquido: usa o bruto quando o líquido for desconhecido, para não subestimar.
    'receita_liquida_total_centavos', COALESCE((
      SELECT sum(COALESCE(liquido_centavos, valor_centavos)) FROM pagamento WHERE status = 'approved'
    ), 0),
    'receita_liquida_mes_centavos', COALESCE((
      SELECT sum(COALESCE(liquido_centavos, valor_centavos)) FROM pagamento
      WHERE status = 'approved' AND COALESCE(processado_em, criado_em) >= inicio_mes
    ), 0),
    'pagamentos_aprovados',  (SELECT count(*) FROM pagamento WHERE status = 'approved'),
    'pagamentos_recusados',  (SELECT count(*) FROM pagamento WHERE status = 'rejected'),
    'por_plano', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', p.slug, 'nome', p.nome, 'ativas', t.ativas) ORDER BY p.ordem)
      FROM plano p
      JOIN LATERAL (
        SELECT count(*) AS ativas FROM assinatura a
        WHERE a.plano_id = p.id AND a.status = 'authorized' AND NOT a.cortesia
          AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now())
      ) t ON true
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_financeiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_financeiro() TO authenticated;

-- B1) Ativação manual (pagamento POR FORA do MP) ------------------------------
-- Ativa uma assinatura para quem pagou fora do Mercado Pago e registra o
-- pagamento, para a receita refletir o que entrou. Líquido = bruto (sem taxa de
-- gateway). NÃO é cortesia: isto é receita real.
CREATE OR REPLACE FUNCTION public.admin_ativar_assinatura_manual(
  p_user_email text,
  p_plano_slug text,
  p_pago_em timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_plano public.plano%ROWTYPE;
  v_assinatura_id uuid;
  v_proxima timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE lower(email) = lower(trim(p_user_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'usuario_nao_encontrado: %', p_user_email;
  END IF;

  SELECT * INTO v_plano FROM public.plano WHERE slug = p_plano_slug;
  IF v_plano.id IS NULL THEN
    RAISE EXCEPTION 'plano_nao_encontrado: %', p_plano_slug;
  END IF;

  v_proxima := p_pago_em + (
    GREATEST(v_plano.frequency, 1) *
    CASE v_plano.frequency_type WHEN 'days' THEN interval '1 day' ELSE interval '1 month' END
  );

  -- B5: mantém no máximo uma assinatura 'authorized' por usuário (índice único).
  UPDATE public.assinatura
     SET status = 'cancelled', cancelada_em = now()
   WHERE user_id = v_user_id AND status = 'authorized';

  INSERT INTO public.assinatura (user_id, plano_id, status, data_inicio, proxima_cobranca, cortesia, cancelada_em)
  VALUES (v_user_id, v_plano.id, 'authorized', p_pago_em, v_proxima, false, NULL)
  RETURNING id INTO v_assinatura_id;

  INSERT INTO public.pagamento (
    user_id, assinatura_id, valor_centavos, liquido_centavos, moeda, status, metodo_pagamento, processado_em
  )
  VALUES (
    v_user_id, v_assinatura_id, v_plano.preco_centavos, v_plano.preco_centavos,
    COALESCE(v_plano.moeda, 'BRL'), 'approved', 'manual', p_pago_em
  );

  RETURN jsonb_build_object(
    'assinatura_id', v_assinatura_id,
    'user_id', v_user_id,
    'plano', v_plano.slug,
    'valor_centavos', v_plano.preco_centavos,
    'proxima_cobranca', v_proxima
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_ativar_assinatura_manual(text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ativar_assinatura_manual(text, text, timestamptz) TO authenticated;

-- C1) Liberar acesso de cortesia (GRÁTIS) -------------------------------------
-- Concede acesso por N meses sem cobrança e sem registrar pagamento. Marcado
-- como cortesia → não entra em nenhuma métrica financeira.
CREATE OR REPLACE FUNCTION public.admin_liberar_acesso_gratuito(
  p_user_id uuid,
  p_meses integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assinatura_id uuid;
  v_proxima timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'usuario_nao_encontrado';
  END IF;

  v_proxima := now() + (GREATEST(p_meses, 1) * interval '1 month');

  -- B5: mantém no máximo uma assinatura 'authorized' por usuário (índice único).
  UPDATE public.assinatura
     SET status = 'cancelled', cancelada_em = now()
   WHERE user_id = p_user_id AND status = 'authorized';

  INSERT INTO public.assinatura (user_id, plano_id, status, data_inicio, proxima_cobranca, cortesia, cancelada_em)
  VALUES (p_user_id, NULL, 'authorized', now(), v_proxima, true, NULL)
  RETURNING id INTO v_assinatura_id;

  RETURN jsonb_build_object(
    'assinatura_id', v_assinatura_id,
    'user_id', p_user_id,
    'cortesia', true,
    'proxima_cobranca', v_proxima
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_liberar_acesso_gratuito(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_liberar_acesso_gratuito(uuid, integer) TO authenticated;

-- C2) Revogar acesso de cortesia ----------------------------------------------
-- Só cancela assinaturas de cortesia (não toca em assinaturas pagas).
CREATE OR REPLACE FUNCTION public.admin_revogar_acesso_gratuito(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canceladas integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.assinatura
     SET status = 'cancelled', proxima_cobranca = now(), cancelada_em = now()
   WHERE user_id = p_user_id AND status = 'authorized' AND cortesia;
  GET DIAGNOSTICS v_canceladas = ROW_COUNT;

  RETURN jsonb_build_object('canceladas', v_canceladas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_revogar_acesso_gratuito(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revogar_acesso_gratuito(uuid) TO authenticated;

-- B2) Backfill: pagamento manual das assinaturas PAGAS POR FORA ----------------
-- authorized, NÃO cortesia e sem nenhum pagamento aprovado. Idempotente.
INSERT INTO public.pagamento (
  user_id, assinatura_id, valor_centavos, liquido_centavos, moeda, status, metodo_pagamento, processado_em
)
SELECT
  a.user_id, a.id, p.preco_centavos, p.preco_centavos,
  COALESCE(p.moeda, 'BRL'), 'approved', 'manual', COALESCE(a.data_inicio, a.criado_em)
FROM public.assinatura a
JOIN public.plano p ON p.id = a.plano_id
WHERE a.status = 'authorized'
  AND NOT a.cortesia
  AND NOT EXISTS (
    SELECT 1 FROM public.pagamento pg
    WHERE pg.assinatura_id = a.id AND pg.status = 'approved'
  );
