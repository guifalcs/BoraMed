-- ============================================================
-- Correções do financeiro do admin:
--
-- A) Líquido das cobranças recorrentes: o endpoint authorized_payment do MP não
--    retorna o net_received_amount (líquido). Por isso os pagamentos mensais
--    ficavam com liquido_centavos NULL e sumiam de TODAS as métricas de
--    "Líquido", aparecendo só o semestral. O webhook passou a buscar o líquido
--    no pagamento real subjacente; aqui, a RPC usa o BRUTO como fallback quando
--    o líquido for desconhecido — assim nada fica de fora dos totais, inclusive
--    os registros já existentes.
--
-- B) Pagamentos feitos por fora (fora do Mercado Pago): assinaturas ativadas
--    manualmente nunca geravam um registro em `pagamento`, então o dinheiro que
--    de fato entrou não aparecia na receita (só inflava MRR/previsão, que vêm da
--    tabela `assinatura`). Esta migration:
--      B1) cria a RPC admin_ativar_assinatura_manual, caminho único e correto
--          para ativar uma assinatura paga por fora — registra a assinatura E o
--          pagamento (metodo_pagamento = 'manual'), mantendo a receita íntegra;
--      B2) faz o backfill: registra o pagamento manual de toda assinatura
--          'authorized' que hoje não tem nenhum pagamento aprovado.
-- ============================================================

-- A) Resumo financeiro: líquido com fallback para o bruto ------------------
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
    -- Líquido: usa o bruto quando o líquido for desconhecido (ex.: cobranças
    -- antigas sem net informado), para não subestimar a receita líquida.
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

-- B1) Ativação manual (pagamento por fora) ---------------------------------
-- Ativa uma assinatura para um usuário que pagou por fora do Mercado Pago e
-- registra o pagamento correspondente, para a receita refletir o que entrou.
-- O líquido = bruto (não há taxa de gateway numa transação fora do MP).
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

  -- Concede acesso por um período do plano a partir da data do pagamento.
  v_proxima := p_pago_em + (
    GREATEST(v_plano.frequency, 1) *
    CASE v_plano.frequency_type WHEN 'days' THEN interval '1 day' ELSE interval '1 month' END
  );

  -- B5: mantém no máximo uma assinatura 'authorized' por usuário (índice único).
  UPDATE public.assinatura
     SET status = 'cancelled', cancelada_em = now()
   WHERE user_id = v_user_id AND status = 'authorized';

  INSERT INTO public.assinatura (user_id, plano_id, status, data_inicio, proxima_cobranca, cancelada_em)
  VALUES (v_user_id, v_plano.id, 'authorized', p_pago_em, v_proxima, NULL)
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

-- B2) Backfill: registra o pagamento manual das assinaturas ativadas por fora
-- (authorized e sem nenhum pagamento aprovado). Idempotente: após rodar, essas
-- assinaturas passam a ter pagamento aprovado e não são pegas de novo.
INSERT INTO public.pagamento (
  user_id, assinatura_id, valor_centavos, liquido_centavos, moeda, status, metodo_pagamento, processado_em
)
SELECT
  a.user_id, a.id, p.preco_centavos, p.preco_centavos,
  COALESCE(p.moeda, 'BRL'), 'approved', 'manual', COALESCE(a.data_inicio, a.criado_em)
FROM public.assinatura a
JOIN public.plano p ON p.id = a.plano_id
WHERE a.status = 'authorized'
  AND NOT EXISTS (
    SELECT 1 FROM public.pagamento pg
    WHERE pg.assinatura_id = a.id AND pg.status = 'approved'
  );
