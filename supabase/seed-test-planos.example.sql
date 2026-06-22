-- Planos de TESTE — aponta a tabela `plano` para os IDs do seu vendedor de teste
-- do Mercado Pago. As migrations já semeiam valores sandbox; rode este script
-- (ajustado) se os seus planos de teste forem outros.
--
-- Stack local:   supabase db query -f supabase/seed-test-planos.example.sql
-- Branch:        via Dashboard (SQL Editor do branch) ou MCP execute_sql no branch.
--
-- NÃO comite a versão preenchida com IDs reais se preferir mantê-los fora do git;
-- este arquivo é só um modelo (.example).

-- Mensal (recorrente, preapproval_plan):
UPDATE public.plano SET
  preco_centavos        = 990,                                   -- valor baixo p/ teste
  mp_preapproval_plan_id = 'SEU_PREAPPROVAL_PLAN_ID_MENSAL_TESTE',
  mp_init_point          = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=SEU_PREAPPROVAL_PLAN_ID_MENSAL_TESTE'
WHERE slug = 'mensal';

-- Semestral (pagamento único / Checkout Pro — NÃO usa preapproval_plan):
UPDATE public.plano SET
  preco_centavos        = 1990,
  mp_preapproval_plan_id = NULL,
  mp_init_point          = NULL
WHERE slug = 'semestral';

-- Confere:
SELECT slug, preco_centavos, recorrente, mp_preapproval_plan_id, mp_init_point
FROM public.plano ORDER BY ordem;
