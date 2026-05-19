-- Limpeza: índice duplicado, RLS initplan, revoke anon, consolidação prova_questao
-- Ref: Supabase Advisor findings pós-migration 20260518120000

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
-- 3. Revogar EXECUTE de anon em funções SECURITY DEFINER internas
----------------------------------------------------------------------
revoke execute on function public.admin_get_stats() from anon;
revoke execute on function public.is_admin(uuid) from anon;
revoke execute on function public.prevent_papel_change() from anon;

----------------------------------------------------------------------
-- 4. Consolidar policies de prova_questao
----------------------------------------------------------------------
drop policy if exists "prova_questao_select_authenticated" on public.prova_questao;
drop policy if exists "prova_questao_admin_all" on public.prova_questao;

-- SELECT para qualquer authenticated
create policy "prova_questao_select_authenticated" on public.prova_questao
  for select to authenticated
  using (true);

-- ALL (INSERT/UPDATE/DELETE + SELECT) somente admin
create policy "prova_questao_admin_all" on public.prova_questao
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
