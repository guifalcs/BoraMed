-- ============================================================
-- Reajuste de planos: Mensal R$49,90 e troca do Anual pelo Semestral
-- (6 meses, R$199,90). Os mp_preapproval_plan_id/mp_init_point abaixo são os
-- planos de TESTE (sandbox, vendedor de teste). Em produção, recriar os planos
-- com o token de produção e substituir esses valores.
-- ============================================================

UPDATE public.plano
  SET preco_centavos = 4990
  WHERE slug = 'mensal';

UPDATE public.plano SET
  slug = 'semestral',
  nome = 'Semestral',
  descricao = 'Acesso completo por 6 meses. Pague em até 6x sem juros.',
  preco_centavos = 19990,
  frequency = 6,
  frequency_type = 'months',
  mp_preapproval_plan_id = 'e796c8fb31004e7399a23e4f127d97ec',
  mp_init_point = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=e796c8fb31004e7399a23e4f127d97ec'
  WHERE slug = 'anual';
