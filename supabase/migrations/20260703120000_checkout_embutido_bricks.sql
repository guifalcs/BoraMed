-- ============================================================
-- Checkout embutido (Mercado Pago Bricks + Checkout API)
-- Migration 100% ADITIVA: nova tabela pagamento_intencao + colunas extras em
-- pagamento + comentários de deprecação. Nenhum DROP, nenhuma mudança em
-- RLS/policies existentes, nenhuma mudança em tem_assinatura_ativa.
-- O fluxo legado (redirect) continua funcionando sem alterações.
-- ============================================================

-- ============================================================
-- Tabela: pagamento_intencao (tentativas de pagamento, pré-webhook)
-- Uma linha por tentativa iniciada no checkout embutido. Serve para:
--  - idempotência server-side (idempotency_key = attempt_id do frontend);
--  - rate limit por usuário (mitiga card testing);
--  - polling do frontend (Pix/boleto/3DS/pendente) via PostgREST com RLS own;
--  - snapshot do preço cobrado (sempre do banco, nunca do cliente).
-- Escrita SOMENTE via service role (edge functions). Aluno apenas lê a própria.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagamento_intencao (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plano_id           uuid REFERENCES public.plano(id),
  tipo               text NOT NULL CHECK (tipo IN ('acesso_unico', 'assinatura')),
  -- attempt_id gerado pelo frontend; também usado como X-Idempotency-Key no MP.
  idempotency_key    uuid NOT NULL UNIQUE,
  mp_payment_id      text UNIQUE,
  mp_preapproval_id  text,
  -- Snapshot do preço DO BANCO no momento da tentativa (nunca vem do cliente).
  valor_centavos     integer NOT NULL CHECK (valor_centavos >= 0),
  metodo             text,
  parcelas           integer CHECK (parcelas BETWEEN 1 AND 12),
  status             text NOT NULL DEFAULT 'criada'
                       CHECK (status IN ('criada', 'processando', 'aprovada', 'pendente',
                                         'recusada', 'expirada', 'cancelada')),
  status_detail      text,
  -- Expiração do meio de pagamento (Pix: +30min; boleto: +3 dias).
  expira_em          timestamptz
);

ALTER TABLE public.pagamento_intencao ENABLE ROW LEVEL SECURITY;

-- Rate limit: contagem de intenções recentes por usuário.
CREATE INDEX IF NOT EXISTS pagamento_intencao_user_criado_idx
  ON public.pagamento_intencao (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS pagamento_intencao_plano_id_idx
  ON public.pagamento_intencao (plano_id);

-- Aluno lê apenas as próprias intenções (polling do status); admin lê todas.
DROP POLICY IF EXISTS "pagamento_intencao_select_own" ON public.pagamento_intencao;
CREATE POLICY "pagamento_intencao_select_own"
  ON public.pagamento_intencao FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

-- Sem política de INSERT/UPDATE/DELETE para authenticated: escrita só via
-- service role (edge functions), que ignora RLS.

DROP TRIGGER IF EXISTS pagamento_intencao_set_atualizado_em ON public.pagamento_intencao;
CREATE TRIGGER pagamento_intencao_set_atualizado_em
  BEFORE UPDATE ON public.pagamento_intencao
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

-- Grants (RLS continua sendo o gate de linhas). Sem INSERT/UPDATE/DELETE para
-- authenticated — alinhado ao hardening de grants do projeto.
GRANT SELECT ON public.pagamento_intencao TO authenticated;
GRANT ALL ON public.pagamento_intencao TO service_role;

-- ============================================================
-- pagamento: colunas extras do checkout embutido (aditivas)
-- ============================================================
ALTER TABLE public.pagamento
  ADD COLUMN IF NOT EXISTS status_detail text,
  ADD COLUMN IF NOT EXISTS parcelas integer,
  ADD COLUMN IF NOT EXISTS intencao_id uuid REFERENCES public.pagamento_intencao(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pagamento_intencao_id_idx ON public.pagamento (intencao_id);

COMMENT ON COLUMN public.pagamento.status_detail IS
  'status_detail do Mercado Pago (ex.: cc_rejected_insufficient_amount). Preenchido pelo checkout embutido.';
COMMENT ON COLUMN public.pagamento.parcelas IS
  'Número de parcelas do pagamento (installments do MP). Preenchido pelo checkout embutido.';
COMMENT ON COLUMN public.pagamento.intencao_id IS
  'Intenção de pagamento (checkout embutido) que originou este pagamento. NULL em pagamentos legados (redirect).';

-- ============================================================
-- Deprecação (checkout por redirect). Colunas mantidas SEM DROP: dados
-- históricos e fluxo legado seguem funcionando durante a janela de observação.
-- ============================================================
COMMENT ON COLUMN public.plano.mp_init_point IS
  'DEPRECADO (checkout embutido via Bricks desde 2026-07): URL de redirect do Checkout Pro/plano no MP. Mantido para o fluxo legado e histórico; não usar em código novo.';
COMMENT ON COLUMN public.plano.mp_preapproval_plan_id IS
  'DEPRECADO (checkout embutido via Bricks desde 2026-07): id do preapproval_plan no MP usado pelo redirect legado. Mantido para o fluxo legado e histórico; não usar em código novo.';
