-- ============================================================
-- Campanhas de e-mail (Resend)
--
-- Objetivo: disparar e-mails personalizados para segmentos de usuários —
-- principalmente "criou conta e não assinou". O envio em si acontece na edge
-- function `enviar-campanha-email` (service role); aqui ficam:
--   * o opt-out de marketing + token público de descadastro (LGPD);
--   * o histórico de campanhas e o log por destinatário (idempotência/retomada);
--   * a DEFINIÇÃO ÚNICA dos segmentos, para que a prévia (contagem no admin) e
--     o disparo real nunca divirjam.
--
-- Regras do público (aplicadas a TODOS os segmentos):
--   * papel = 'aluno'      → admins/super_admins nunca entram em campanha;
--   * banido = false;
--   * email_marketing_optout = false;
--   * e-mail confirmado (auth.users.email_confirmed_at) — cadastro não
--     confirmado costuma ser endereço inválido/typo, e hard bounce queima a
--     reputação do domínio no Resend.
-- ============================================================

-- ============================================================
-- 1) profiles: opt-out de marketing + token público de descadastro
-- ============================================================
-- `email_token` é o identificador usado no link de descadastro do rodapé. É um
-- uuid aleatório (não o id do usuário) justamente para que o link não vaze o
-- user_id nem permita enumerar contas.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_marketing_optout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_marketing_optout_em timestamptz,
  ADD COLUMN IF NOT EXISTS email_token uuid NOT NULL DEFAULT gen_random_uuid();

-- gen_random_uuid() é VOLATILE: o ADD COLUMN reescreve a tabela avaliando o
-- default por linha, então as contas existentes já nascem com tokens distintos.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_token_idx
  ON public.profiles (email_token);

-- ============================================================
-- 2) Tabela: email_campanha (uma linha por disparo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_campanha (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome                text NOT NULL,
  assunto             text NOT NULL,
  corpo_html          text NOT NULL,
  remetente           text NOT NULL,
  segmento            text NOT NULL
                        CHECK (segmento IN ('sem_assinatura_ativa', 'nunca_assinou',
                                            'ex_assinantes', 'todos')),
  status              text NOT NULL DEFAULT 'enviando'
                        CHECK (status IN ('enviando', 'enviada', 'parcial', 'falhou')),
  total_destinatarios integer NOT NULL DEFAULT 0,
  total_enviados      integer NOT NULL DEFAULT 0,
  total_falhas        integer NOT NULL DEFAULT 0,
  -- Descadastrados entre a montagem da lista e o envio (campanha retomada).
  total_cancelados    integer NOT NULL DEFAULT 0,
  erro                text,
  concluida_em        timestamptz
);

ALTER TABLE public.email_campanha ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS email_campanha_criado_em_idx
  ON public.email_campanha (criado_em DESC);

-- Leitura só para admin. Escrita: service role (edge function), que ignora RLS.
DROP POLICY IF EXISTS "email_campanha_select_admin" ON public.email_campanha;
CREATE POLICY "email_campanha_select_admin"
  ON public.email_campanha FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- ============================================================
-- 3) Tabela: email_campanha_destinatario (log por e-mail)
-- Serve para (a) auditoria, (b) idempotência: retomar uma campanha interrompida
-- reenvia apenas o que ficou 'pendente', nunca duplica quem já recebeu.
-- ============================================================
-- `nome_completo` e `email_token` são SNAPSHOT do momento do disparo: o e-mail
-- retomado horas depois sai idêntico ao que teria saído na hora, mesmo que o
-- perfil mude no meio. O opt-out, ao contrário, é reconferido no envio.
CREATE TABLE IF NOT EXISTS public.email_campanha_destinatario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  campanha_id   uuid NOT NULL REFERENCES public.email_campanha(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email         text NOT NULL,
  nome_completo text,
  email_token   uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'enviado', 'falhou', 'cancelado')),
  resend_id     text,
  erro          text,
  enviado_em    timestamptz,
  UNIQUE (campanha_id, email)
);

ALTER TABLE public.email_campanha_destinatario ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS email_campanha_destinatario_campanha_idx
  ON public.email_campanha_destinatario (campanha_id, status);

DROP POLICY IF EXISTS "email_campanha_destinatario_select_admin" ON public.email_campanha_destinatario;
CREATE POLICY "email_campanha_destinatario_select_admin"
  ON public.email_campanha_destinatario FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP TRIGGER IF EXISTS email_campanha_set_atualizado_em ON public.email_campanha;
CREATE TRIGGER email_campanha_set_atualizado_em
  BEFORE UPDATE ON public.email_campanha
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

-- ============================================================
-- 4) Definição ÚNICA dos segmentos
--
-- A edge function (service role) chama esta função para montar a lista real; o
-- admin chama `admin_contar_publico_email` para a prévia. Ambas passam por aqui,
-- então "o que a tela mostra" é sempre "o que vai ser enviado".
--
-- Assinatura ativa espelha public.tem_assinatura_ativa() SEM o bypass de admin
-- (aqui admin não é público de campanha de qualquer forma).
-- ============================================================
CREATE OR REPLACE FUNCTION public.email_publico_alvo(p_segmento text)
RETURNS TABLE (
  user_id        uuid,
  email          text,
  nome_completo  text,
  email_token    uuid,
  criado_em      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      p.id,
      p.email,
      p.nome_completo,
      p.email_token,
      p.criado_em,
      EXISTS (
        SELECT 1 FROM public.assinatura a
        WHERE a.user_id = p.id
          AND (
            (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
            OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
          )
      ) AS tem_ativa,
      EXISTS (
        -- 'pending' = abriu o checkout e nunca pagou → continua contando como
        -- "nunca assinou". Só status efetivados marcam histórico de assinante.
        SELECT 1 FROM public.assinatura a
        WHERE a.user_id = p.id
          AND a.status IN ('authorized', 'paused', 'cancelled')
      ) AS ja_assinou
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.papel = 'aluno'
      AND p.banido = false
      AND p.email_marketing_optout = false
      AND p.email IS NOT NULL
      AND p.email <> ''
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
  )
  SELECT b.id, b.email, b.nome_completo, b.email_token, b.criado_em
  FROM base b
  WHERE CASE p_segmento
    WHEN 'sem_assinatura_ativa' THEN NOT b.tem_ativa
    WHEN 'nunca_assinou'        THEN NOT b.tem_ativa AND NOT b.ja_assinou
    WHEN 'ex_assinantes'        THEN NOT b.tem_ativa AND b.ja_assinou
    WHEN 'todos'                THEN true
    ELSE false
  END
  ORDER BY b.criado_em;
$$;

-- Nunca exposta ao cliente: só a edge function (service role) monta a lista.
REVOKE EXECUTE ON FUNCTION public.email_publico_alvo(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_publico_alvo(text) TO service_role;

-- ============================================================
-- 5) Prévia de contagem para o admin (não expõe os e-mails)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_contar_publico_email(p_segmento text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_total FROM public.email_publico_alvo(p_segmento);
  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_contar_publico_email(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_contar_publico_email(text) TO authenticated;

-- ============================================================
-- 6) Histórico de campanhas para a tela do admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_listar_campanhas_email(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id                  uuid,
  criado_em           timestamptz,
  nome                text,
  assunto             text,
  segmento            text,
  status              text,
  total_destinatarios integer,
  total_enviados      integer,
  total_falhas        integer,
  total_cancelados    integer,
  erro                text,
  criado_por_email    text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.criado_em, c.nome, c.assunto, c.segmento, c.status,
    c.total_destinatarios, c.total_enviados, c.total_falhas, c.total_cancelados, c.erro,
    p.email
  FROM public.email_campanha c
  LEFT JOIN public.profiles p ON p.id = c.criado_por
  ORDER BY c.criado_em DESC
  LIMIT greatest(1, least(p_limit, 200));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_campanhas_email(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_campanhas_email(integer) TO authenticated;

-- ============================================================
-- 7) Descadastro público (link do rodapé)
--
-- Chamada por `anon`: o usuário clica no link do e-mail sem estar logado. O
-- token é a única credencial, e a função devolve apenas true/false — nunca o
-- e-mail nem o perfil —, então não serve para enumerar contas.
-- ============================================================
CREATE OR REPLACE FUNCTION public.descadastrar_email_marketing(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.profiles
     SET email_marketing_optout = true,
         email_marketing_optout_em = COALESCE(email_marketing_optout_em, now())
   WHERE email_token = p_token
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.descadastrar_email_marketing(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.descadastrar_email_marketing(uuid) TO anon, authenticated;
