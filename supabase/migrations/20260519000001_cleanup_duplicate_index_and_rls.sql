-- Limpeza: índice duplicado, RLS initplan, revoke anon, consolidação prova_questao
-- Ref: Supabase Advisor findings pós-migration 20260518235110

----------------------------------------------------------------------
-- 1. Dropar índice duplicado
----------------------------------------------------------------------
drop index if exists public.idx_tentativa_resposta_ordem;
-- manter: idx_tentativa_resposta_tentativa_ordem (mesmas colunas, já existia)

----------------------------------------------------------------------
-- 2. Corrigir RLS initplan (substituir auth.uid() por (select auth.uid()))
----------------------------------------------------------------------

-- profiles_select
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (((select auth.uid()) = id) or public.is_admin());

-- tentativa_select
drop policy if exists "tentativa_select" on public.tentativa;
create policy "tentativa_select" on public.tentativa
  for select to authenticated
  using (((select auth.uid()) = user_id) or public.is_admin());

----------------------------------------------------------------------
-- 3. Revogar EXECUTE de anon/public em funções SECURITY DEFINER internas
----------------------------------------------------------------------
revoke execute on function public.admin_get_stats() from public;
revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.prevent_papel_change() from public;

-- Re-conceder a authenticated (RPCs chamadas pelo app)
grant execute on function public.admin_get_stats() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

----------------------------------------------------------------------
-- 4. Consolidar policies de prova_questao (eliminar overlap permissivo em SELECT)
----------------------------------------------------------------------
drop policy if exists "prova_questao_select_authenticated" on public.prova_questao;
drop policy if exists "prova_questao_admin_all" on public.prova_questao;

-- SELECT para qualquer authenticated
create policy "prova_questao_select_authenticated" on public.prova_questao
  for select to authenticated
  using (true);

-- INSERT/UPDATE/DELETE somente admin (sem overlap em SELECT)
create policy "prova_questao_admin_insert" on public.prova_questao
  for insert to authenticated
  with check (public.is_admin());

create policy "prova_questao_admin_update" on public.prova_questao
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "prova_questao_admin_delete" on public.prova_questao
  for delete to authenticated
  using (public.is_admin());

----------------------------------------------------------------------
-- 5. Storage: restringir listagem do bucket questao-imagens a admin
----------------------------------------------------------------------
drop policy if exists "questao-imagens: leitura pública" on storage.objects;
create policy "questao-imagens: leitura admin" on storage.objects
  for select using (
    bucket_id = 'questao-imagens'
    and (select public.is_admin())
  );
