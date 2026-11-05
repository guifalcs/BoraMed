-- ============================================================================
-- Teste do módulo de gabaritos extraoficiais (gabarito_prova).
--
-- O QUE VALIDA
--   1. `anon` não tem privilégio nenhum nas tabelas (leitura pública só por RPC);
--   2. rascunho não vaza: nem na lista pública nem no get por slug;
--   3. aluno logado não salva/publica (42501) e não lê a tabela direto;
--   4. admin salva (slug gerado, colisão com sufixo), valida letra fora das
--      alternativas e numeração, publica e notifica o período UMA vez;
--   5. o contador de visualização só conta publicado.
--
-- Roda dentro de transação com ROLLBACK: não deixa resíduo no banco.
--
-- COMO RODAR (stack local):
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/gabaritos_provas_test.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ─── 1) Privilégios de tabela ──────────────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.gabarito_prova', 'select')
     or has_table_privilege('anon', 'public.gabarito_prova_questao', 'select') then
    raise exception 'FALHA: anon tem SELECT direto nas tabelas de gabarito';
  end if;
  if has_table_privilege('authenticated', 'public.gabarito_prova', 'insert')
     or has_table_privilege('authenticated', 'public.gabarito_prova', 'update')
     or has_table_privilege('authenticated', 'public.gabarito_prova_questao', 'insert') then
    raise exception 'FALHA: authenticated escreve direto nas tabelas de gabarito (deveria ser só RPC)';
  end if;
  if has_function_privilege('anon', 'public.admin_salvar_gabarito_prova(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.admin_publicar_gabarito_prova(uuid, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'public.admin_excluir_gabarito_prova(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_listar_gabaritos_provas()', 'execute')
     or has_function_privilege('authenticated', 'public.gerar_slug_gabarito_prova(text, integer, text)', 'execute') then
    raise exception 'FALHA: anon executa RPC de admin (ou helper exposto)';
  end if;
  if has_table_privilege('authenticated', 'public.gabarito_prova', 'delete') then
    raise exception 'FALHA: authenticated tem DELETE direto (exclusão é só por RPC)';
  end if;
  raise notice 'OK 1: privilégios de tabela';
end $$;

-- Fixture própria (não depende do seed): um admin e um aluno do 6º período,
-- confirmados. O trigger handle_new_user cria o profile de cada um.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('9ab0f000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gab-test-admin@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0f000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gab-test-aluno@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now());
update public.profiles set papel = 'admin' where id = '9ab0f000-0000-0000-0000-00000000a001';
update public.profiles set papel = 'aluno', periodo = 6 where id = '9ab0f000-0000-0000-0000-00000000a002';

create temp table _ctx (admin_id uuid, aluno_id uuid) on commit drop;
insert into _ctx values ('9ab0f000-0000-0000-0000-00000000a001', '9ab0f000-0000-0000-0000-00000000a002');
grant select on _ctx to authenticated, anon;

-- ─── 4) Admin cria rascunho e publicado ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id from _ctx), 'role', 'authenticated')::text, true);

do $$
declare
  v_r1 jsonb; v_r2 jsonb; v_pub jsonb; v_pub2 jsonb; v_err text;
begin
  v_r1 := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'tipo_prova', 'Teste Gab', 'periodo', 6, 'semestre', '2026.2', 'qtd_alternativas', 4,
    'questoes', jsonb_build_array(
      jsonb_build_object('numero', 1, 'resposta', 'a'),
      jsonb_build_object('numero', 2, 'anulada', true, 'resposta', 'B'),
      jsonb_build_object('numero', 3)
    )));
  if v_r1->>'slug' <> 'teste-gab-6-periodo-2026-2' then
    raise exception 'FALHA: slug inesperado %', v_r1->>'slug';
  end if;

  -- Mesma prova de novo (ex.: versão B) → sufixo.
  v_r2 := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'tipo_prova', 'Teste Gab', 'periodo', 6, 'semestre', '2026.2', 'qtd_alternativas', 5,
    'questoes', jsonb_build_array(jsonb_build_object('numero', 1, 'resposta', 'E'))));
  if v_r2->>'slug' <> 'teste-gab-6-periodo-2026-2-2' then
    raise exception 'FALHA: colisão de slug sem sufixo (%)', v_r2->>'slug';
  end if;

  -- Letra normalizada e anulada sem letra.
  if (select resposta from public.gabarito_prova_questao
       where gabarito_id = (v_r1->>'id')::uuid and numero = 1) <> 'A' then
    raise exception 'FALHA: resposta não foi normalizada para maiúscula';
  end if;
  if (select resposta from public.gabarito_prova_questao
       where gabarito_id = (v_r1->>'id')::uuid and numero = 2) is not null then
    raise exception 'FALHA: questão anulada manteve letra';
  end if;

  -- Letra E numa prova de 4 alternativas.
  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'tipo_prova', 'N1', 'periodo', 1, 'semestre', '2026.2', 'qtd_alternativas', 4,
      'questoes', jsonb_build_array(jsonb_build_object('numero', 1, 'resposta', 'E'))));
    raise exception 'FALHA: aceitou letra fora das alternativas';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'resposta_fora_das_alternativas' then raise; end if;
  end;

  -- Numeração com buraco.
  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'tipo_prova', 'N1', 'periodo', 1, 'semestre', '2026.2',
      'questoes', jsonb_build_array(jsonb_build_object('numero', 1), jsonb_build_object('numero', 3))));
    raise exception 'FALHA: aceitou numeração com buraco';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'numeracao_invalida' then raise; end if;
  end;

  -- Publica o primeiro notificando o 6º período; republicar não notifica de novo.
  v_pub := public.admin_publicar_gabarito_prova((v_r1->>'id')::uuid, true, true);
  if (v_pub->>'notificados')::int < 1 then
    raise exception 'FALHA: nenhuma notificação enviada ao período 6';
  end if;
  perform public.admin_publicar_gabarito_prova((v_r1->>'id')::uuid, false, false);
  v_pub2 := public.admin_publicar_gabarito_prova((v_r1->>'id')::uuid, true, true);
  if (v_pub2->>'notificados')::int <> 0 then
    raise exception 'FALHA: notificou duas vezes o mesmo gabarito';
  end if;
  if v_pub2->>'publicado_em' <> v_pub->>'publicado_em' then
    raise exception 'FALHA: republicar renovou publicado_em';
  end if;

  -- Caminho de edição (com id): mantém slug, troca folha inteira.
  perform public.admin_salvar_gabarito_prova(jsonb_build_object(
    'id', v_r1->>'id', 'tipo_prova', 'Teste Gab', 'periodo', 6, 'semestre', '2026.2', 'qtd_alternativas', 4,
    'questoes', jsonb_build_array(
      jsonb_build_object('numero', 1, 'resposta', 'D'),
      jsonb_build_object('numero', 2, 'anulada', true),
      jsonb_build_object('numero', 3, 'resposta', 'C'))));
  if (select slug from public.gabarito_prova where id = (v_r1->>'id')::uuid) <> 'teste-gab-6-periodo-2026-2'
     or (select resposta from public.gabarito_prova_questao where gabarito_id = (v_r1->>'id')::uuid and numero = 1) <> 'D' then
    raise exception 'FALHA: edição reescreveu slug ou não trocou a folha';
  end if;

  -- Publicar vazio é recusado.
  v_r2 := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'tipo_prova', 'Vazio Gab', 'periodo', 12, 'semestre', '2026.2',
    'questoes', jsonb_build_array(jsonb_build_object('numero', 1))));
  begin
    perform public.admin_publicar_gabarito_prova((v_r2->>'id')::uuid, true, true);
    raise exception 'FALHA: publicou gabarito sem nenhuma resposta';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'gabarito_vazio' then raise; end if;
  end;

  -- Aviso sem destinatário não é "gasto": notificado_em só grava se alguém recebeu.
  update public.profiles set periodo = 6 where periodo = 12 and papel = 'aluno';
  perform public.admin_salvar_gabarito_prova(jsonb_build_object(
    'id', v_r2->>'id', 'tipo_prova', 'Vazio Gab', 'periodo', 12, 'semestre', '2026.2',
    'questoes', jsonb_build_array(jsonb_build_object('numero', 1, 'resposta', 'A'))));
  v_pub := public.admin_publicar_gabarito_prova((v_r2->>'id')::uuid, true, true);
  if (v_pub->>'notificados')::int <> 0 or v_pub->>'notificado_em' is not null then
    raise exception 'FALHA: aviso sem destinatário marcou notificado_em (%)', v_pub;
  end if;

  -- Exclusão por RPC; segunda vez levanta não encontrado.
  perform public.admin_excluir_gabarito_prova((v_r2->>'id')::uuid);
  begin
    perform public.admin_excluir_gabarito_prova((v_r2->>'id')::uuid);
    raise exception 'FALHA: excluir inexistente não levantou erro';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'gabarito_nao_encontrado' then raise; end if;
  end;

  raise notice 'OK 4: admin salva, edita, valida, publica, notifica uma vez e exclui';
end $$;

-- ─── 3) Aluno logado ───────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select aluno_id from _ctx), 'role', 'authenticated')::text, true);

do $$
declare v_state text;
begin
  if (select count(*) from public.gabarito_prova) <> 0 then
    raise exception 'FALHA: aluno lê gabarito_prova direto';
  end if;
  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'tipo_prova', 'N1', 'periodo', 1, 'semestre', '2026.2',
      'questoes', jsonb_build_array(jsonb_build_object('numero', 1))));
    raise exception 'FALHA: aluno salvou gabarito';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise; end if;
  end;
  if not exists (
    select 1 from public.notificacoes
    where user_id = (select aluno_id from _ctx) and dados->>'link' = '/dashboard/gabaritos/teste-gab-6-periodo-2026-2'
  ) then
    raise exception 'FALHA: aluno do período não recebeu a notificação com link';
  end if;
  if jsonb_array_length(public.get_gabarito_prova('teste-gab-6-periodo-2026-2')->'questoes') <> 3 then
    raise exception 'FALHA: aluno logado não lê as respostas do publicado';
  end if;
  if public.get_gabarito_prova('teste-gab-6-periodo-2026-2-2') is not null then
    raise exception 'FALHA: aluno lê rascunho';
  end if;
  raise notice 'OK 3: aluno lê respostas do publicado, sem escrita nem rascunho; notificação recebida';
end $$;

-- ─── 2 e 5) Anônimo ────────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare v_lista jsonb; v_views int;
begin
  v_lista := public.listar_gabaritos_provas(6);
  if not exists (select 1 from jsonb_array_elements(v_lista) e where e->>'slug' = 'teste-gab-6-periodo-2026-2') then
    raise exception 'FALHA: publicado não aparece na lista pública';
  end if;
  if exists (select 1 from jsonb_array_elements(v_lista) e where e->>'slug' = 'teste-gab-6-periodo-2026-2-2') then
    raise exception 'FALHA: rascunho vazou na lista pública';
  end if;
  -- Sem conta não há resposta: o get completo nem executa para anon.
  begin
    perform public.get_gabarito_prova('teste-gab-6-periodo-2026-2');
    raise exception 'FALHA: anon leu as respostas (get_gabarito_prova)';
  exception when insufficient_privilege then null;
  end;
  -- A vitrine mostra a prova, mas nenhuma letra nem comentário.
  if (public.get_gabarito_prova_vitrine('teste-gab-6-periodo-2026-2')->>'total_questoes')::int <> 3 then
    raise exception 'FALHA: vitrine sem a contagem de questões';
  end if;
  if public.get_gabarito_prova_vitrine('teste-gab-6-periodo-2026-2') ?| array['questoes', 'resposta', 'comentario', 'observacao'] then
    raise exception 'FALHA: vitrine expõe conteúdo do gabarito';
  end if;
  if public.get_gabarito_prova_vitrine('teste-gab-6-periodo-2026-2-2') is not null then
    raise exception 'FALHA: rascunho vazou na vitrine';
  end if;

  perform public.registrar_visualizacao_gabarito_prova('teste-gab-6-periodo-2026-2');
  perform public.registrar_visualizacao_gabarito_prova('teste-gab-6-periodo-2026-2-2');
  v_views := (public.get_gabarito_prova_vitrine('teste-gab-6-periodo-2026-2')->>'visualizacoes')::int;
  if v_views <> 1 then
    raise exception 'FALHA: contador de visualização = % (esperado 1)', v_views;
  end if;
  raise notice 'OK 2/5: anônimo só vê a vitrine do publicado (sem respostas); contador ok';
end $$;

reset role;

-- ─── 6) Público do e-mail: teto 50, fora de Ipatinga primeiro ─────────────
do $$
declare
  v_g uuid := gen_random_uuid();
  v_lista uuid[];
begin
  if has_function_privilege('authenticated', 'public.email_publico_gabarito(uuid, integer)', 'execute')
     or has_function_privilege('anon', 'public.email_publico_gabarito(uuid, integer)', 'execute') then
    raise exception 'FALHA: email_publico_gabarito exposto a cliente (só service_role)';
  end if;
  if not has_function_privilege('authenticated', 'public.ultimo_gabarito_publicado_em()', 'execute') then
    raise exception 'FALHA: aluno não consegue ler o selo de novidade';
  end if;

  -- 60 alunos do 11º período: 30 de Ipatinga, 29 de Salvador, 1 descadastrado.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
  select ('9ab0e000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'gab-email-' || n || '@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now(),
         now() - make_interval(hours => n)
  from generate_series(1, 60) n;
  update public.profiles p
     set papel = 'aluno', periodo = 11,
         faculdade_unidade = case when n <= 30 then 'ipatinga_mg' else 'salvador_ba' end,
         email_marketing_optout = (n = 60)
    from generate_series(1, 60) n
   where p.id = ('9ab0e000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
  -- Isola o teste de outros alunos do 11º que existam no banco.
  update public.profiles set periodo = 10
   where periodo = 11 and id::text not like '9ab0e000-%' and papel = 'aluno';

  insert into public.gabarito_prova (id, slug, tipo_prova, periodo, semestre, status, publicado_em)
  values (v_g, 'teste-email-11', 'Teste', 11, '2026.2', 'publicado', now());

  select array_agg(user_id) into v_lista from public.email_publico_gabarito(v_g, 500);
  if cardinality(v_lista) <> 50 then
    raise exception 'FALHA: teto de 50 não respeitado (%)', cardinality(v_lista);
  end if;
  -- Os 29 de Salvador (o 60 é descadastrado) vêm antes de qualquer Ipatinga.
  if exists (
    select 1 from unnest(v_lista[1:29]) u join public.profiles p on p.id = u
    where p.faculdade_unidade = 'ipatinga_mg'
  ) then
    raise exception 'FALHA: Ipatinga entrou antes dos alunos de fora';
  end if;
  if ('9ab0e000-0000-0000-0000-000000000060')::uuid = any (v_lista) then
    raise exception 'FALHA: descadastrado recebeu e-mail';
  end if;

  update public.gabarito_prova set status = 'rascunho' where id = v_g;
  if exists (select 1 from public.email_publico_gabarito(v_g, 50)) then
    raise exception 'FALHA: rascunho gerou público de e-mail';
  end if;
  raise notice 'OK 6: público do e-mail (teto 50, fora de Ipatinga primeiro, sem descadastrado)';
end $$;

rollback;
