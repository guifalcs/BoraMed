-- ============================================================
-- Cancelamento com carência: ao cancelar, o usuário mantém acesso até a data
-- da próxima cobrança (proxima_cobranca). Assim, tem_assinatura_ativa libera
-- também assinaturas 'cancelled' enquanto proxima_cobranca for futura.
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
      AND (
        (status = 'authorized' AND (proxima_cobranca IS NULL OR proxima_cobranca > now()))
        OR (status = 'cancelled' AND proxima_cobranca IS NOT NULL AND proxima_cobranca > now())
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.tem_assinatura_ativa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_assinatura_ativa(uuid) TO authenticated;
