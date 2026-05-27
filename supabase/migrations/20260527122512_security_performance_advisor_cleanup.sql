-- Corrige warnings plausiveis do Supabase Security/Performance Advisor.
-- Mantem RPCs SECURITY DEFINER autenticadas que sao parte do contrato do app.

ALTER FUNCTION public.buscar_avisos_pendentes()
  SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.marcar_aviso_visto(uuid)
  SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.buscar_notificacoes(integer)
  SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.marcar_notificacao_lida(uuid)
  SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.marcar_todas_notificacoes_lidas()
  SET search_path TO 'public', 'pg_temp';

ALTER FUNCTION public.admin_listar_avisos()
  SET search_path TO 'public', 'pg_temp';

-- Buckets publicos servem arquivos via URL publica; SELECT amplo em storage.objects
-- permitiria listar objetos e nao e necessario para getPublicUrl.
DROP POLICY IF EXISTS "avisos_imagens_select" ON storage.objects;
DROP POLICY IF EXISTS "questao_imagens_select_authenticated" ON storage.objects;

-- Evita duas policies permissivas de SELECT para authenticated em avisos.
DROP POLICY IF EXISTS "avisos_admin_select_all" ON public.avisos;
DROP POLICY IF EXISTS "avisos_select_authenticated" ON public.avisos;

CREATE POLICY "avisos_select_authenticated"
  ON public.avisos
  FOR SELECT TO authenticated
  USING (ativo = true OR public.is_admin());

-- Funcoes auxiliares/trigger nao precisam ser chamadas diretamente pela API.
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ultimo_login() FROM public, anon, authenticated;
