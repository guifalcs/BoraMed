-- ============================================================
-- Correções pré-produção:
-- S1) tem_assinatura_ativa só pode consultar a própria assinatura (ou admin)
--     — evita que um usuário descubra o status de outro via RPC.
-- B2) métricas do admin contam "ativas" por ACESSO REAL (não por status cru),
--     para não contar semestral (pagamento único) já expirado como ativo.
-- ============================================================

-- S1 -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tem_assinatura_ativa(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- Só permite consultar a própria assinatura; admin pode consultar qualquer uid.
    WHEN uid IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN false
    ELSE public.is_admin(uid) OR EXISTS (
      SELECT 1 FROM public.assinatura
      WHERE user_id = uid
        AND (
          (status = 'authorized' AND (proxima_cobranca IS NULL OR proxima_cobranca > now()))
          OR (status = 'cancelled' AND proxima_cobranca IS NOT NULL AND proxima_cobranca > now())
        )
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.tem_assinatura_ativa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_assinatura_ativa(uuid) TO authenticated;

-- B2 -----------------------------------------------------------
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
    -- "ativa" = authorized E ainda com acesso (proxima futura/nula)
    'assinaturas_ativas', (
      SELECT count(*) FROM assinatura
      WHERE status = 'authorized' AND (proxima_cobranca IS NULL OR proxima_cobranca > now())
    ),
    'assinaturas_canceladas',  (SELECT count(*) FROM assinatura WHERE status = 'cancelled'),
    'novas_no_mes',            (SELECT count(*) FROM assinatura WHERE status = 'authorized' AND criado_em >= inicio_mes),
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
      WHERE a.status = 'authorized' AND p.recorrente
        AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now())
    ), 0),
    'previsao_30d_centavos', COALESCE((
      SELECT sum(p.preco_centavos)
      FROM assinatura a JOIN plano p ON p.id = a.plano_id
      WHERE a.status = 'authorized' AND p.recorrente
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
    'receita_liquida_total_centavos', COALESCE((
      SELECT sum(liquido_centavos) FROM pagamento WHERE status = 'approved'
    ), 0),
    'receita_liquida_mes_centavos', COALESCE((
      SELECT sum(liquido_centavos) FROM pagamento
      WHERE status = 'approved' AND COALESCE(processado_em, criado_em) >= inicio_mes
    ), 0),
    'pagamentos_aprovados',  (SELECT count(*) FROM pagamento WHERE status = 'approved'),
    'pagamentos_recusados',  (SELECT count(*) FROM pagamento WHERE status = 'rejected'),
    'por_plano', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', p.slug, 'nome', p.nome, 'ativas', t.ativas) ORDER BY p.ordem)
      FROM plano p
      JOIN LATERAL (
        SELECT count(*) AS ativas FROM assinatura a
        WHERE a.plano_id = p.id AND a.status = 'authorized'
          AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now())
      ) t ON true
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_financeiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_financeiro() TO authenticated;
