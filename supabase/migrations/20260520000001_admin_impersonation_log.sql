CREATE TABLE public.admin_impersonation_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID,
  admin_email  TEXT        NOT NULL,
  target_id    UUID,
  target_email TEXT        NOT NULL,
  target_name  TEXT,
  ip           TEXT,
  user_agent   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_impersonation_log_admin_id  ON public.admin_impersonation_log (admin_id);
CREATE INDEX idx_impersonation_log_target_id ON public.admin_impersonation_log (target_id);
CREATE INDEX idx_impersonation_log_criado_em ON public.admin_impersonation_log (criado_em DESC);

ALTER TABLE public.admin_impersonation_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_impersonation_log FROM anon, authenticated;
GRANT SELECT ON public.admin_impersonation_log TO authenticated;

CREATE POLICY "impersonation_log_select_admin"
  ON public.admin_impersonation_log
  FOR SELECT TO authenticated
  USING (public.is_admin());
