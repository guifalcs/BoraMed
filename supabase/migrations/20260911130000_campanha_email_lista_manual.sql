-- ============================================================
-- Campanha de e-mail: segmento 'lista_manual'
--
-- Objetivo: hoje só existem duas formas de mandar e-mail — um segmento inteiro
-- (centenas/milhares de pessoas) ou o modo "teste" (uma cópia avulsa, sem
-- registrar nada). Faltava o meio-termo: mandar para PESSOAS ESPECÍFICAS (um
-- aluno com um problema pontual, um pequeno grupo) com o mesmo rastro de
-- qualquer campanha — histórico, log por destinatário, retomada em falha.
--
-- 'lista_manual' reaproveita TODA a tubulação de public.email_campanha /
-- email_campanha_destinatario: só muda de onde vem a lista de e-mails.
-- ============================================================

ALTER TABLE public.email_campanha
  DROP CONSTRAINT email_campanha_segmento_check;

ALTER TABLE public.email_campanha
  ADD CONSTRAINT email_campanha_segmento_check
  CHECK (segmento IN ('sem_assinatura_ativa', 'nunca_assinou',
                      'ex_assinantes', 'todos', 'lista_manual'));

-- Assinatura muda (novo parâmetro `p_emails`): CREATE OR REPLACE não substitui
-- a função antiga, ela ficaria coexistindo e o default tornaria a chamada de
-- 1 argumento AMBÍGUA entre as duas. Precisa dropar antes.
DROP FUNCTION IF EXISTS public.email_publico_alvo(text);
DROP FUNCTION IF EXISTS public.admin_contar_publico_email(text);

-- `p_emails` só é lido quando p_segmento = 'lista_manual' — nos demais
-- segmentos o comportamento é idêntico ao de antes (NULL de default preserva
-- as chamadas existentes de admin_contar_publico_email).
CREATE OR REPLACE FUNCTION public.email_publico_alvo(p_segmento text, p_emails text[] DEFAULT NULL)
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
    WHEN 'lista_manual'         THEN lower(b.email) = ANY (SELECT lower(e) FROM unnest(p_emails) e)
    ELSE false
  END
  ORDER BY b.criado_em;
$$;

CREATE OR REPLACE FUNCTION public.admin_contar_publico_email(p_segmento text, p_emails text[] DEFAULT NULL)
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

  SELECT count(*) INTO v_total FROM public.email_publico_alvo(p_segmento, p_emails);
  RETURN v_total;
END;
$$;

-- Grants perdidos no drop+create (assinatura nova é um objeto novo).
REVOKE EXECUTE ON FUNCTION public.email_publico_alvo(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_publico_alvo(text, text[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_contar_publico_email(text, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_contar_publico_email(text, text[]) TO authenticated;
