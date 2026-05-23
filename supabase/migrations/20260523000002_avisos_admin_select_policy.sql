-- Admin precisa ver avisos inativos também (para gerenciar)
CREATE POLICY "avisos_admin_select_all"
  ON public.avisos FOR SELECT TO authenticated
  USING (public.is_admin());
