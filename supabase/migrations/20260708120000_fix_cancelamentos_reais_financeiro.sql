-- ============================================================
-- Corrige as métricas de cancelamento do financeiro do admin.
--
-- Problema: 'assinaturas_canceladas' e 'cancelamentos_no_mes' contavam TODA
-- linha com status 'cancelled', inflando o número com registros que não são
-- churn de cliente:
--   1. Tentativas de checkout com pagamento RECUSADO: o usuário tenta de novo,
--      cria outro preapproval e a assinatura anterior (que nunca teve pagamento
--      aprovado) fica 'cancelled'. Um único cliente com 3 cartões recusados
--      gerava 3 "cancelamentos".
--   2. Assinaturas SUPERADAS pela regra B5 (troca de plano / nova concessão
--      cancela a 'authorized' anterior do mesmo usuário): o cliente continua
--      ativo, mas a linha antiga aparecia como cancelamento.
--
-- Nova definição de cancelamento REAL (churn): assinatura 'cancelled', não
-- cortesia, que teve ao menos 1 pagamento aprovado (foi de fato pagante) e
-- cujo usuário NÃO possui outra assinatura paga 'authorized' (ou seja, ele
-- realmente saiu — não foi troca de plano nem retry de checkout).
-- ============================================================

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
    -- Cancelamentos REAIS: ex-pagante que saiu (ver cabeçalho da migration).
    'assinaturas_canceladas', (
      SELECT count(*) FROM assinatura a
      WHERE a.status = 'cancelled' AND NOT a.cortesia
        AND EXISTS (
          SELECT 1 FROM pagamento pg
          WHERE pg.assinatura_id = a.id AND pg.status = 'approved'
        )
        AND NOT EXISTS (
          SELECT 1 FROM assinatura b
          WHERE b.user_id = a.user_id AND b.id <> a.id
            AND b.status = 'authorized' AND NOT b.cortesia
        )
    ),
    'novas_no_mes', (SELECT count(*) FROM assinatura WHERE status = 'authorized' AND NOT cortesia AND criado_em >= inicio_mes),
    'cancelamentos_no_mes', (
      SELECT count(*) FROM assinatura a
      WHERE a.cancelada_em >= inicio_mes AND NOT a.cortesia
        AND EXISTS (
          SELECT 1 FROM pagamento pg
          WHERE pg.assinatura_id = a.id AND pg.status = 'approved'
        )
        AND NOT EXISTS (
          SELECT 1 FROM assinatura b
          WHERE b.user_id = a.user_id AND b.id <> a.id
            AND b.status = 'authorized' AND NOT b.cortesia
        )
    ),
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
