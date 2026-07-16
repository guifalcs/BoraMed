-- O plano MENSAL deixa de ser assinatura recorrente (preapproval) e passa a
-- pagamento único (à vista), como o semestral: o checkout embutido e as edge
-- functions ramificam por `plano.recorrente`, então virar a flag redireciona
-- novas compras do mensal para /v1/payments (mp-processar-pagamento), com
-- acesso concedido por `frequency` meses via proxima_cobranca.
--
-- Assinantes mensais LEGADOS (assinatura.mp_preapproval_id preenchido) não são
-- afetados: os webhooks subscription_preapproval / subscription_authorized_payment,
-- o mp-gerenciar-assinatura (cancelar/pausar/reativar/trocar cartão) e a
-- reconciliação horária continuam operando sobre o preapproval existente no MP.
-- `mp_preapproval_plan_id` fica preservado apenas como registro histórico —
-- mp-processar-assinatura e mp-criar-assinatura rejeitam planos não recorrentes.

-- Reajuste de preços na mesma virada: mensal R$ 49,90 → R$ 59,90 e semestral
-- R$ 199,90 → R$ 240,00 (6x de R$ 40,00 exatos). Preapprovals legados NÃO são
-- reajustados — seguem cobrando o valor contratado no MP.

UPDATE public.plano
SET recorrente = false,
    preco_centavos = 5990,
    descricao = 'Acesso completo por 1 mês, sem renovação automática.'
WHERE slug = 'mensal';

UPDATE public.plano
SET preco_centavos = 24000
WHERE slug = 'semestral';
