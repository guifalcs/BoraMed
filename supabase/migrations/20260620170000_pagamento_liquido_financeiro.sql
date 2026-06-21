-- ============================================================
-- Receita líquida: armazena o valor líquido recebido por pagamento
-- (net_received_amount do MP = bruto - taxas) e expõe no resumo financeiro.
-- ============================================================
ALTER TABLE public.pagamento
  ADD COLUMN IF NOT EXISTS liquido_centavos integer;

-- Resumo financeiro: + receita líquida (total e no mês)
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
    'assinaturas_ativas',      (SELECT count(*) FROM assinatura WHERE status = 'authorized'),
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
    ), 0),
    'previsao_30d_centavos', COALESCE((
      SELECT sum(p.preco_centavos)
      FROM assinatura a JOIN plano p ON p.id = a.plano_id
      WHERE a.status = 'authorized' AND p.recorrente
        AND a.proxima_cobranca IS NOT NULL
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
      ) t ON true
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_financeiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_financeiro() TO authenticated;

-- Lista de pagamentos: + plano_nome e líquido (muda o retorno -> DROP antes)
DROP FUNCTION IF EXISTS public.admin_listar_pagamentos(integer);
CREATE FUNCTION public.admin_listar_pagamentos(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  criado_em timestamptz,
  processado_em timestamptz,
  user_email text,
  plano_slug text,
  plano_nome text,
  valor_centavos integer,
  liquido_centavos integer,
  moeda text,
  status text,
  metodo_pagamento text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    pg.id,
    pg.criado_em,
    pg.processado_em,
    pr.email AS user_email,
    pl.slug AS plano_slug,
    pl.nome AS plano_nome,
    pg.valor_centavos,
    pg.liquido_centavos,
    pg.moeda,
    pg.status,
    pg.metodo_pagamento
  FROM pagamento pg
  LEFT JOIN profiles pr ON pr.id = pg.user_id
  LEFT JOIN assinatura a ON a.id = pg.assinatura_id
  LEFT JOIN plano pl ON pl.id = a.plano_id
  WHERE public.is_admin()
  ORDER BY pg.criado_em DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_pagamentos(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_pagamentos(integer) TO authenticated;
