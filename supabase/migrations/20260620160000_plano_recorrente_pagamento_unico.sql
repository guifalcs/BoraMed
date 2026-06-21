-- ============================================================
-- Suporte a planos de pagamento ÚNICO (parcelável) além de recorrentes.
-- - plano.recorrente: true = assinatura recorrente (preapproval); false =
--   pagamento único via Checkout Pro (parcelável), que concede acesso por
--   `frequency` meses sem renovação automática.
-- - assinatura.mp_payment_id: id do pagamento (Checkout Pro) que originou um
--   acesso de pagamento único (conflito de upsert no webhook).
-- ============================================================
ALTER TABLE public.plano
  ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT true;

UPDATE public.plano SET recorrente = true  WHERE slug = 'mensal';
UPDATE public.plano SET recorrente = false WHERE slug = 'semestral';

ALTER TABLE public.assinatura
  ADD COLUMN IF NOT EXISTS mp_payment_id text UNIQUE;
