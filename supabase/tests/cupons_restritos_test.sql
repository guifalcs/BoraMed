-- ============================================================================
-- Teste de cupons restritos a e-mails / usuários (cupom.restrito +
-- cupom_destinatario).
--
-- O QUE VALIDA
--   1. privilégios: anon sem acesso à tabela; authenticated sem escrita direta;
--      anon não executa admin_salvar_cupom / admin_listar_cupons;
--   2. cupom público continua valendo para qualquer um (regressão);
--   3. cupom restrito: destinatário por user_id e por e-mail (case-insensitive)
--      passam; não-destinatário recebe 'invalido' IDÊNTICO ao de código inexistente;
--   4. e-mail NÃO confirmado não ganha o cupom; sem usuário (null) não passa;
--   5. authenticated não consegue "emprestar" elegibilidade via p_user_id;
--      service_role (edge) consegue informar o usuário;
--   6. restrição vem ANTES de expirado/esgotado (não vaza que o código existe);
--   7. admin_salvar_cupom: normaliza e deduplica e-mails, rejeita e-mail inválido,
--      usuário inexistente, restrito sem destinatário (rollback total), e
--      p_destinatarios null mantém a lista (alternar "ativo" não a apaga);
--   8. esvaziar a lista de um cupom restrito é recusado — nunca vira público;
--   9. aluno não executa RPC de admin.
--
-- Roda dentro de transação com ROLLBACK: não deixa resíduo no banco.
--
-- COMO RODAR (stack local):
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/cupons_restritos_test.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ─── Fixture ────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('9ab0c000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cupom-test-admin@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0c000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cupom-test-alvo-id@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0c000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'Cupom-Test-Alvo-Email@BoraMed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0c000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cupom-test-outro@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  -- e-mail igual ao de um destinatário, porém NÃO confirmado
  ('9ab0c000-0000-0000-0000-00000000c005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cupom-test-naoconfirmado@boramed.test', '', null, '{"provider":"email"}', '{}', now(), now());
update public.profiles set papel = 'admin', periodo = 9 where id = '9ab0c000-0000-0000-0000-00000000c001';
update public.profiles set papel = 'aluno', periodo = 1
 where id in ('9ab0c000-0000-0000-0000-00000000c002', '9ab0c000-0000-0000-0000-00000000c003',
              '9ab0c000-0000-0000-0000-00000000c004', '9ab0c000-0000-0000-0000-00000000c005');

-- Restrito com lista vazia (estado a que o cascade de perfil apagado leva).
insert into public.cupom (codigo, tipo, valor, ativo, restrito)
values ('TESTEVAZIO', 'percentual', 10, true, true);

-- Um plano ativo qualquer para validar.
create temp table _plano on commit drop as
  select slug, preco_centavos from public.plano where ativo = true order by ordem limit 1;
grant select on _plano to anon, authenticated, service_role;

-- Cupons: público, restrito (por id + e-mail), restrito expirado.
insert into public.cupom (id, codigo, tipo, valor, ativo, restrito) values
  ('9ab0c000-0000-0000-0000-0000000000a1', 'TESTEPUBLICO', 'percentual', 10, true, false),
  ('9ab0c000-0000-0000-0000-0000000000a2', 'TESTERESTRITO', 'percentual', 10, true, true);
insert into public.cupom (id, codigo, tipo, valor, ativo, restrito, expira_em) values
  ('9ab0c000-0000-0000-0000-0000000000a3', 'TESTERESTRITOEXP', 'percentual', 10, true, true, now() - interval '1 day');
insert into public.cupom_destinatario (cupom_id, user_id) values
  ('9ab0c000-0000-0000-0000-0000000000a2', '9ab0c000-0000-0000-0000-00000000c002'),
  ('9ab0c000-0000-0000-0000-0000000000a3', '9ab0c000-0000-0000-0000-00000000c002');
insert into public.cupom_destinatario (cupom_id, email) values
  ('9ab0c000-0000-0000-0000-0000000000a2', 'cupom-test-alvo-email@boramed.test'),
  ('9ab0c000-0000-0000-0000-0000000000a2', 'cupom-test-naoconfirmado@boramed.test');

-- ─── 1) Privilégios ─────────────────────────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.cupom_destinatario', 'select') then
    raise exception 'FALHA: anon tem SELECT em cupom_destinatario';
  end if;
  if has_table_privilege('authenticated', 'public.cupom_destinatario', 'insert')
     or has_table_privilege('authenticated', 'public.cupom_destinatario', 'update')
     or has_table_privilege('authenticated', 'public.cupom_destinatario', 'delete') then
    raise exception 'FALHA: authenticated tem escrita direta em cupom_destinatario';
  end if;
  if has_function_privilege('anon',
       'public.admin_salvar_cupom(uuid,text,text,text,integer,uuid,boolean,timestamptz,integer,integer,uuid,text,boolean,numeric,numeric,boolean,boolean,boolean,jsonb)',
       'execute') then
    raise exception 'FALHA: anon executa admin_salvar_cupom';
  end if;
  if has_function_privilege('anon', 'public.admin_listar_cupons()', 'execute') then
    raise exception 'FALHA: anon executa admin_listar_cupons';
  end if;
  if has_function_privilege('anon', 'public.validar_cupom(text,text,uuid)', 'execute') then
    raise exception 'FALHA: anon executa validar_cupom';
  end if;
  -- A assinatura antiga não pode ter sobrado (overload ambíguo no PostgREST).
  if (select count(*) from pg_proc where proname = 'admin_salvar_cupom'
        and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'FALHA: admin_salvar_cupom tem mais de uma assinatura';
  end if;
end $$;

-- Helper de asserção: valida `motivo`/`valido` de validar_cupom.
create or replace function pg_temp.esperar(p_rotulo text, p_codigo text, p_user uuid,
                                           p_valido boolean, p_motivo text)
returns void language plpgsql as $$
declare r record; v_slug text;
begin
  select slug into v_slug from _plano;
  select * into r from public.validar_cupom(p_codigo, v_slug, p_user);
  if r.valido is distinct from p_valido or r.motivo is distinct from p_motivo then
    raise exception 'FALHA [%]: esperado valido=% motivo=%, veio valido=% motivo=%',
      p_rotulo, p_valido, p_motivo, r.valido, r.motivo;
  end if;
end $$;
grant execute on function pg_temp.esperar(text, text, uuid, boolean, text) to anon, authenticated, service_role;

-- ─── 2–6) validar_cupom como service_role (edge: sem auth.uid()) ────────────
set local role service_role;
select pg_temp.esperar('público/qualquer um',        'TESTEPUBLICO',   '9ab0c000-0000-0000-0000-00000000c004', true,  'ok');
select pg_temp.esperar('público/sem usuário',        'TESTEPUBLICO',   null,                                   true,  'ok');
select pg_temp.esperar('restrito/por user_id',       'TESTERESTRITO',  '9ab0c000-0000-0000-0000-00000000c002', true,  'ok');
select pg_temp.esperar('restrito/por e-mail (case)', 'testerestrito',  '9ab0c000-0000-0000-0000-00000000c003', true,  'ok');
select pg_temp.esperar('restrito/não destinatário',  'TESTERESTRITO',  '9ab0c000-0000-0000-0000-00000000c004', false, 'invalido');
select pg_temp.esperar('restrito/sem usuário',       'TESTERESTRITO',  null,                                   false, 'invalido');
select pg_temp.esperar('restrito/e-mail não confirm.', 'TESTERESTRITO', '9ab0c000-0000-0000-0000-00000000c005', false, 'invalido');
-- Restrição vem antes de "expirado": não-destinatário não descobre que existe.
select pg_temp.esperar('restrito expirado/alheio',   'TESTERESTRITOEXP', '9ab0c000-0000-0000-0000-00000000c004', false, 'invalido');
select pg_temp.esperar('restrito expirado/dest.',    'TESTERESTRITOEXP', '9ab0c000-0000-0000-0000-00000000c002', false, 'expirado');

-- Retorno do alheio é idêntico ao de código inexistente (sem vazar existência).
do $$
declare a record; b record; v_slug text;
begin
  select slug into v_slug from _plano;
  select * into a from public.validar_cupom('TESTERESTRITO', v_slug, '9ab0c000-0000-0000-0000-00000000c004');
  select * into b from public.validar_cupom('NAOEXISTE9999', v_slug, '9ab0c000-0000-0000-0000-00000000c004');
  if a is distinct from b then
    raise exception 'FALHA: retorno do cupom restrito difere do inexistente (%, %)', a, b;
  end if;
end $$;
reset role;

-- ─── 5) authenticated não empresta a elegibilidade de outro via p_user_id ───
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9ab0c000-0000-0000-0000-00000000c004","role":"authenticated"}', true);
-- Alheio passando o id do destinatário: continua inválido.
select pg_temp.esperar('authenticated/p_user_id ignorado', 'TESTERESTRITO',
                       '9ab0c000-0000-0000-0000-00000000c002', false, 'invalido');
select set_config('request.jwt.claims',
  '{"sub":"9ab0c000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select pg_temp.esperar('authenticated/destinatário (sem p_user_id)', 'TESTERESTRITO', null, true, 'ok');
reset role;

-- ─── 9) Aluno não executa RPC de admin ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9ab0c000-0000-0000-0000-00000000c004","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_listar_cupons();
    raise exception 'FALHA: aluno listou cupons' using errcode = 'XX999';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;
  begin
    perform public.admin_salvar_cupom(null, 'XALUNO', null, 'percentual', 10, null, true, null, null, null,
                                      null, null, false, 0, 0, true, true, false, null);
    raise exception 'FALHA: aluno salvou cupom' using errcode = 'XX999';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'permission_denied' then raise; end if;
  end;
  -- Escrita direta bloqueada por privilégio/RLS.
  begin
    insert into public.cupom_destinatario (cupom_id, email)
      values ('9ab0c000-0000-0000-0000-0000000000a1', 'x@x.test');
    raise exception 'FALHA: aluno inseriu destinatário direto';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.cupom_destinatario) <> 0 then
    raise exception 'FALHA: aluno enxerga destinatários (RLS)';
  end if;
end $$;
reset role;

-- ─── 7–8) admin_salvar_cupom ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9ab0c000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

do $$
declare
  v_id uuid;
  v_n integer;
  v_lista jsonb;
begin
  -- Cria restrito com e-mails sujos: normaliza, deduplica, mistura user_id.
  v_id := public.admin_salvar_cupom(
    null, 'testenovo', 'desc', 'percentual', 15, null, true, null, null, 1,
    null, null, false, 0, 0, true, true,
    true,
    '[{"email":"  Foo@Bar.TEST "},{"email":"foo@bar.test"},{"user_id":"9ab0c000-0000-0000-0000-00000000c004"}]'::jsonb
  );
  select count(*) into v_n from public.cupom_destinatario where cupom_id = v_id;
  if v_n <> 2 then raise exception 'FALHA: esperava 2 destinatários (dedup), veio %', v_n; end if;
  if not exists (select 1 from public.cupom_destinatario where cupom_id = v_id and email = 'foo@bar.test') then
    raise exception 'FALHA: e-mail não normalizado';
  end if;

  -- Listagem expõe restrito + destinatários (e-mail do usuário resolvido).
  select (e->'destinatarios') into v_lista
  from jsonb_array_elements(public.admin_listar_cupons()) e where e->>'codigo' = 'TESTENOVO';
  if jsonb_array_length(v_lista) <> 2
     or not exists (select 1 from jsonb_array_elements(v_lista) d
                    where d->>'email' = 'cupom-test-outro@boramed.test') then
    raise exception 'FALHA: listagem de destinatários incorreta: %', v_lista;
  end if;

  -- p_destinatarios null mantém a lista (caso do botão "alternar ativo").
  perform public.admin_salvar_cupom(
    v_id, 'TESTENOVO', 'desc', 'percentual', 15, null, false, null, null, 1,
    null, null, false, 0, 0, true, true, null, null);
  select count(*) into v_n from public.cupom_destinatario where cupom_id = v_id;
  if v_n <> 2 then raise exception 'FALHA: lista perdida ao salvar sem p_destinatarios'; end if;
  if not (select restrito from public.cupom where id = v_id) then
    raise exception 'FALHA: restrito mudou ao salvar com p_restrito null';
  end if;

  -- Esvaziar a lista de cupom restrito é recusado e a lista antiga sobrevive.
  begin
    perform public.admin_salvar_cupom(
      v_id, 'TESTENOVO', 'desc', 'percentual', 15, null, true, null, null, 1,
      null, null, false, 0, 0, true, true, true, '[]'::jsonb);
    raise exception 'FALHA: aceitou cupom restrito sem destinatários';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'restrito_sem_destinatarios' then raise; end if;
  end;
  select count(*) into v_n from public.cupom_destinatario where cupom_id = v_id;
  if v_n <> 2 then raise exception 'FALHA: rollback não preservou a lista (%)', v_n; end if;

  -- Tornar público + esvaziar é o caminho legítimo.
  perform public.admin_salvar_cupom(
    v_id, 'TESTENOVO', 'desc', 'percentual', 15, null, true, null, null, 1,
    null, null, false, 0, 0, true, true, false, '[]'::jsonb);
  if (select restrito from public.cupom where id = v_id) then
    raise exception 'FALHA: não virou público';
  end if;

  -- Desativar cupom restrito cuja lista ficou vazia (ex.: perfil do destinatário
  -- apagado → cascade) NÃO pode ser barrado.
  -- (fixture: cupom TESTEVAZIO restrito e sem destinatários, criado no topo)
  perform public.admin_salvar_cupom(
    (select id from public.cupom where codigo = 'TESTEVAZIO'), 'TESTEVAZIO', null, 'percentual', 10,
    null, false, null, null, null, null, null, false, 0, 0, true, true, null, null);
  if (select ativo from public.cupom where codigo = 'TESTEVAZIO') then
    raise exception 'FALHA: não conseguiu desativar cupom restrito com lista vazia';
  end if;

  -- user_id malformado vira erro de negócio.
  begin
    perform public.admin_salvar_cupom(null, 'TESTEBAD5', null, 'percentual', 10, null, true, null, null, null,
      null, null, false, 0, 0, true, true, true, '[{"user_id":"abc"}]'::jsonb);
    raise exception 'FALHA: aceitou user_id malformado';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'destinatario_invalido' then raise; end if;
  end;

  -- Validações de entrada.
  begin
    perform public.admin_salvar_cupom(null, 'TESTEBAD1', null, 'percentual', 10, null, true, null, null, null,
      null, null, false, 0, 0, true, true, true, '[{"email":"nao-e-email"}]'::jsonb);
    raise exception 'FALHA: aceitou e-mail inválido';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'email_invalido' then raise; end if;
  end;
  begin
    perform public.admin_salvar_cupom(null, 'TESTEBAD2', null, 'percentual', 10, null, true, null, null, null,
      null, null, false, 0, 0, true, true, true,
      '[{"user_id":"00000000-0000-0000-0000-00000000dead"}]'::jsonb);
    raise exception 'FALHA: aceitou usuário inexistente';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'usuario_nao_encontrado' then raise; end if;
  end;
  begin
    perform public.admin_salvar_cupom(null, 'TESTEBAD3', null, 'percentual', 10, null, true, null, null, null,
      null, null, false, 0, 0, true, true, true, '[{"email":"a@b.test","user_id":"9ab0c000-0000-0000-0000-00000000c004"}]'::jsonb);
    raise exception 'FALHA: aceitou destinatário com email E user_id';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'destinatario_invalido' then raise; end if;
  end;
  begin
    perform public.admin_salvar_cupom(null, 'TESTEBAD4', null, 'percentual', 10, null, true, null, null, null,
      null, null, false, 0, 0, true, true, true, null);
    raise exception 'FALHA: aceitou novo cupom restrito sem lista';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'restrito_sem_destinatarios' then raise; end if;
  end;
  -- Cupom rejeitado não deixa rastro (rollback da função).
  if exists (select 1 from public.cupom where codigo like 'TESTEBAD%') then
    raise exception 'FALHA: cupom inválido persistiu';
  end if;
end $$;
reset role;

-- Apagar cupom leva os destinatários junto (cascade).
do $$
begin
  delete from public.cupom where id = '9ab0c000-0000-0000-0000-0000000000a2';
  if exists (select 1 from public.cupom_destinatario
             where cupom_id = '9ab0c000-0000-0000-0000-0000000000a2') then
    raise exception 'FALHA: destinatários órfãos após apagar cupom';
  end if;
end $$;

\echo 'OK: cupons_restritos_test'
rollback;
