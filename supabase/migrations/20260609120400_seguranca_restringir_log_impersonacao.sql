-- Segurança BAIXO/endurecimento — o log de impersonação só deve ser legível
-- pelo super_admin (antes qualquer admin lia todo o histórico). O insert é feito
-- pela edge function via service_role (bypassa RLS), então não é afetado.

DROP POLICY IF EXISTS impersonation_log_select_admin       ON public.admin_impersonation_log;
DROP POLICY IF EXISTS impersonation_log_select_super_admin ON public.admin_impersonation_log;

CREATE POLICY impersonation_log_select_super_admin
  ON public.admin_impersonation_log
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());
