-- Coluna de cupom na tabela de pagamentos do admin (/admin/financeiro).
--
-- O cupom não vive em `pagamento`: o snapshot fica em
-- `pagamento_intencao.cupom_id/desconto_centavos` (checkout embutido), e o
-- pagamento aponta para a intenção via `pagamento.intencao_id`. A RPC passa a
-- expor o código do cupom e o desconto aplicado por esse caminho.
--
-- Pagamentos sem intenção (assinatura recorrente / cobranças antigas) voltam
-- com cupom_codigo null e desconto_centavos 0 — a UI mostra "—".

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
  metodo_pagamento text,
  cupom_codigo text,
  desconto_centavos integer
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
    pg.metodo_pagamento,
    c.codigo AS cupom_codigo,
    COALESCE(pi.desconto_centavos, 0) AS desconto_centavos
  FROM pagamento pg
  LEFT JOIN profiles pr ON pr.id = pg.user_id
  LEFT JOIN assinatura a ON a.id = pg.assinatura_id
  LEFT JOIN plano pl ON pl.id = a.plano_id
  LEFT JOIN pagamento_intencao pi ON pi.id = pg.intencao_id
  LEFT JOIN cupom c ON c.id = pi.cupom_id
  WHERE public.is_admin()
  ORDER BY pg.criado_em DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_pagamentos(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_pagamentos(integer) TO authenticated;
