-- ============================================================
-- Pagamentos recorrentes (Mercado Pago) — planos, assinaturas, pagamentos
-- Modelo: assinatura com plano associado (preapproval_plan + preapproval).
-- Checkout por redirecionamento (init_point). Fonte da verdade do status:
-- webhook do Mercado Pago. Paywall total: acesso ao conteúdo exige assinatura
-- com status 'authorized'.
-- ============================================================

-- ============================================================
-- Tabela: plano (catálogo configurável)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plano (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now(),
  slug                     text NOT NULL UNIQUE,
  nome                     text NOT NULL,
  descricao                text,
  preco_centavos           integer NOT NULL CHECK (preco_centavos >= 0),
  moeda                    text NOT NULL DEFAULT 'BRL',
  frequency                integer NOT NULL DEFAULT 1 CHECK (frequency > 0),
  frequency_type           text NOT NULL DEFAULT 'months' CHECK (frequency_type IN ('days', 'months')),
  -- Plano de assinatura correspondente no Mercado Pago (preapproval_plan).
  mp_preapproval_plan_id   text UNIQUE,
  -- URL de checkout do plano (init_point) retornada pelo MP; o aluno é
  -- redirecionado para cá (com external_reference anexado pela edge function).
  mp_init_point            text,
  ativo                    boolean NOT NULL DEFAULT true,
  ordem                    integer NOT NULL DEFAULT 0
);

ALTER TABLE public.plano ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado lê os planos ativos; admin lê todos.
DROP POLICY IF EXISTS "plano_select_ativos" ON public.plano;
CREATE POLICY "plano_select_ativos"
  ON public.plano FOR SELECT TO authenticated
  USING (ativo OR public.is_admin());

-- Escrita restrita a admin.
DROP POLICY IF EXISTS "plano_admin_all" ON public.plano;
CREATE POLICY "plano_admin_all"
  ON public.plano FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Tabela: assinatura (espelho do preapproval do MP)
-- Escrita SOMENTE via service role (edge functions). Aluno apenas lê a própria.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assinatura (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plano_id            uuid REFERENCES public.plano(id),
  mp_preapproval_id   text UNIQUE,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'authorized', 'paused', 'cancelled')),
  data_inicio         timestamptz,
  proxima_cobranca    timestamptz,
  cancelada_em        timestamptz
);

ALTER TABLE public.assinatura ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS assinatura_user_id_idx ON public.assinatura (user_id);
CREATE INDEX IF NOT EXISTS assinatura_status_idx ON public.assinatura (status);
CREATE INDEX IF NOT EXISTS assinatura_mp_preapproval_id_idx ON public.assinatura (mp_preapproval_id);

-- Aluno lê apenas a(s) própria(s) assinatura(s); admin lê todas.
DROP POLICY IF EXISTS "assinatura_select_own" ON public.assinatura;
CREATE POLICY "assinatura_select_own"
  ON public.assinatura FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Sem política de INSERT/UPDATE/DELETE para authenticated: escrita só via
-- service role (edge functions), que ignora RLS.

-- ============================================================
-- Tabela: pagamento (histórico de cobranças / parcelas)
-- Escrita SOMENTE via service role. Aluno apenas lê os próprios.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagamento (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em                 timestamptz NOT NULL DEFAULT now(),
  atualizado_em             timestamptz NOT NULL DEFAULT now(),
  user_id                   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assinatura_id             uuid REFERENCES public.assinatura(id) ON DELETE SET NULL,
  mp_payment_id             text UNIQUE,
  mp_authorized_payment_id  text UNIQUE,
  valor_centavos            integer,
  moeda                     text NOT NULL DEFAULT 'BRL',
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'authorized', 'in_process',
                                                'rejected', 'refunded', 'cancelled', 'charged_back')),
  metodo_pagamento          text,
  processado_em             timestamptz
);

ALTER TABLE public.pagamento ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pagamento_user_id_idx ON public.pagamento (user_id);
CREATE INDEX IF NOT EXISTS pagamento_assinatura_id_idx ON public.pagamento (assinatura_id);

DROP POLICY IF EXISTS "pagamento_select_own" ON public.pagamento;
CREATE POLICY "pagamento_select_own"
  ON public.pagamento FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================
-- Trigger: atualizado_em automático (reusa public.update_atualizado_em(),
-- já definida no projeto com search_path seguro)
-- ============================================================
DROP TRIGGER IF EXISTS plano_set_atualizado_em ON public.plano;
CREATE TRIGGER plano_set_atualizado_em
  BEFORE UPDATE ON public.plano
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

DROP TRIGGER IF EXISTS assinatura_set_atualizado_em ON public.assinatura;
CREATE TRIGGER assinatura_set_atualizado_em
  BEFORE UPDATE ON public.assinatura
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

DROP TRIGGER IF EXISTS pagamento_set_atualizado_em ON public.pagamento;
CREATE TRIGGER pagamento_set_atualizado_em
  BEFORE UPDATE ON public.pagamento
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

-- ============================================================
-- Grants para os roles da API (RLS continua sendo o gate de linhas).
-- service_role é usado pelas edge functions (bypassa RLS).
-- ============================================================
GRANT SELECT ON public.plano TO anon, authenticated;
GRANT ALL ON public.plano TO service_role;

GRANT SELECT ON public.assinatura TO authenticated;
GRANT ALL ON public.assinatura TO service_role;

GRANT SELECT ON public.pagamento TO authenticated;
GRANT ALL ON public.pagamento TO service_role;

-- ============================================================
-- Helper: usuário tem assinatura ativa?
-- Usado pelo guard de paywall (via RPC) e por eventuais RLS de conteúdo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.tem_assinatura_ativa(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin(uid) OR EXISTS (
    SELECT 1 FROM public.assinatura
    WHERE user_id = uid
      AND status = 'authorized'
      AND (proxima_cobranca IS NULL OR proxima_cobranca > now())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.tem_assinatura_ativa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_assinatura_ativa(uuid) TO authenticated;

-- ============================================================
-- Seed: planos padrão. Preços PROVISÓRIOS — alinhar com os preços finais e,
-- ao mudar valor, atualizar também o transaction_amount do preapproval_plan no
-- Mercado Pago (PUT /preapproval_plan/{id}). Os IDs e init_points abaixo são
-- os planos de TESTE (sandbox). Em produção, recriar os planos com o token de
-- produção e substituir mp_preapproval_plan_id / mp_init_point.
-- ============================================================
INSERT INTO public.plano
  (slug, nome, descricao, preco_centavos, frequency, frequency_type, ordem,
   mp_preapproval_plan_id, mp_init_point)
VALUES
  ('mensal', 'Mensal', 'Acesso completo, cobrança mensal.', 2990, 1, 'months', 1,
   '25ea79e2bd6446489bf1e57d15825583',
   'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=25ea79e2bd6446489bf1e57d15825583'),
  ('anual',  'Anual',  'Acesso completo, cobrança anual (2 meses grátis).', 28800, 12, 'months', 2,
   '603be423f986484e828bc9a4f3766285',
   'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=603be423f986484e828bc9a4f3766285')
ON CONFLICT (slug) DO NOTHING;
