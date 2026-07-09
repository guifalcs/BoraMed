-- ============================================================================
-- Teste de regressão de SEGURANÇA: RLS admin-only da tabela ia_agente
-- (migration 20260709120000). A config da IA (Aurora) só pode ser lida/escrita
-- por admin; anon nem tem grant.
--
-- Roda contra o stack LOCAL após `supabase db reset --local` (usa o admin do
-- seed: teste@boramed.com = 11111111-1111-1111-1111-111111111111).
--
-- Como rodar:
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/ia_agente_rls_test.sql
--
-- Precisa trocar para o role `authenticated`/`anon` de verdade: o superusuário
-- postgres BYPASSA RLS, então testar como postgres não valida nada.
-- Falha => RAISE EXCEPTION (psql sai != 0).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 1 — anon: sem grant, leitura deve dar insufficient_privilege.
-- ─────────────────────────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  perform count(*) from public.ia_agente;
  raise exception 'RLS FALHOU: anon conseguiu ler ia_agente';
exception
  when insufficient_privilege then
    raise notice 'OK anon negado (insufficient_privilege)';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 2 — authenticated NÃO-admin: RLS filtra tudo (0 linhas) e o UPDATE
-- não afeta nenhuma linha.
-- ─────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
do $$
declare
  v_count int;
  v_afetadas int;
begin
  select count(*) into v_count from public.ia_agente;
  if v_count <> 0 then
    raise exception 'RLS FALHOU: nao-admin viu % linha(s) de ia_agente', v_count;
  end if;

  update public.ia_agente set ativo = false where slug = 'aurora';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'RLS FALHOU: nao-admin atualizou % linha(s) de ia_agente', v_afetadas;
  end if;
  raise notice 'OK nao-admin: 0 linhas lidas/atualizadas';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 3 — admin: enxerga o agente aurora e consegue atualizar.
-- ─────────────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
do $$
declare
  v_count int;
  v_afetadas int;
begin
  select count(*) into v_count from public.ia_agente where slug = 'aurora';
  if v_count <> 1 then
    raise exception 'RLS FALHOU: admin nao viu o agente aurora (count=%)', v_count;
  end if;

  update public.ia_agente set limite_diario = 150 where slug = 'aurora';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 1 then
    raise exception 'RLS FALHOU: admin nao conseguiu atualizar aurora (afetadas=%)', v_afetadas;
  end if;
  raise notice 'OK admin: le e atualiza aurora';
end $$;
rollback;

-- Se chegou aqui sem exceção, todos os casos passaram.
\echo 'ia_agente_rls_test: TODOS OS CASOS PASSARAM'
