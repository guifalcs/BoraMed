-- ============================================================================
-- Teste do módulo de gabaritos extraoficiais (gabarito_prova).
--
-- O QUE VALIDA
--   1. `anon` não tem privilégio nenhum nas tabelas (leitura pública só por RPC);
--   2. rascunho não vaza: nem na lista pública nem no get por slug;
--   3. aluno logado não salva/publica (42501) e não lê a tabela direto;
--   4. admin salva (slug gerado, colisão com sufixo), valida letra fora das
--      alternativas e numeração, publica e notifica o período UMA vez;
--   5. o contador de visualização só conta publicado;
--   6. público do e-mail (teto 50, fora de Ipatinga primeiro);
--   7. cadernos: vários por gabarito, cada um com folha própria; renomear
--      preserva id/slug, o que sai do payload é excluído, a vitrine mostra os
--      nomes sem nenhuma letra, e o payload antigo (`questoes` na raiz) segue valendo.
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
     or has_table_privilege('anon', 'public.gabarito_prova_questao', 'select')
     or has_table_privilege('anon', 'public.gabarito_prova_caderno', 'select') then
    raise exception 'FALHA: anon tem SELECT direto nas tabelas de gabarito';
  end if;
  if has_table_privilege('authenticated', 'public.gabarito_prova', 'insert')
     or has_table_privilege('authenticated', 'public.gabarito_prova', 'update')
     or has_table_privilege('authenticated', 'public.gabarito_prova_questao', 'insert')
     or has_table_privilege('authenticated', 'public.gabarito_prova_caderno', 'insert')
     or has_table_privilege('authenticated', 'public.gabarito_prova_caderno', 'delete') then
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

-- ─── 7) Cadernos ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id from _ctx), 'role', 'authenticated')::text, true);

do $$
declare
  v_r jsonb; v_r2 jsonb; v_outro jsonb; v_g uuid; v_slug text;
  v_azul uuid; v_azul_slug text; v_verde uuid; v_amarelo uuid;
  v_get jsonb; v_vit jsonb; v_err text;
  v_folha_a jsonb := jsonb_build_array(
    jsonb_build_object('numero', 1, 'resposta', 'A'),
    jsonb_build_object('numero', 2, 'resposta', 'B', 'comentario', 'só no azul'),
    jsonb_build_object('numero', 3, 'anulada', true));
  v_folha_b jsonb := jsonb_build_array(
    jsonb_build_object('numero', 1, 'resposta', 'D'),
    jsonb_build_object('numero', 2),
    jsonb_build_object('numero', 3, 'resposta', 'C'));
begin
  -- Cria com 3 cadernos; a folha de cada um é independente.
  v_r := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2', 'qtd_alternativas', 5,
    'cadernos', jsonb_build_array(
      jsonb_build_object('nome', 'Azul', 'questoes', v_folha_a),
      jsonb_build_object('nome', 'Verde ', 'questoes', v_folha_b),
      jsonb_build_object('nome', 'Amarelo', 'questoes', v_folha_a))));
  v_g := (v_r->>'id')::uuid;
  v_slug := v_r->>'slug';
  if jsonb_array_length(v_r->'cadernos') <> 3 then
    raise exception 'FALHA: salvar não devolveu os 3 cadernos (%)', v_r->'cadernos';
  end if;
  v_azul := (v_r->'cadernos'->0->>'id')::uuid;
  v_azul_slug := v_r->'cadernos'->0->>'slug';
  v_verde := (v_r->'cadernos'->1->>'id')::uuid;
  v_amarelo := (v_r->'cadernos'->2->>'id')::uuid;
  if v_azul_slug <> 'azul' or v_r->'cadernos'->1->>'slug' <> 'verde' or v_r->'cadernos'->1->>'nome' <> 'Verde' then
    raise exception 'FALHA: slug/nome do caderno inesperado (%)', v_r->'cadernos';
  end if;
  if (select resposta from public.gabarito_prova_questao where caderno_id = v_verde and numero = 1) <> 'D'
     or (select resposta from public.gabarito_prova_questao where caderno_id = v_azul and numero = 1) <> 'A' then
    raise exception 'FALHA: folhas dos cadernos se misturaram';
  end if;

  -- Leitura: cadernos em ordem, cada um com a própria folha; `questoes` na raiz
  -- (compat do front antigo) é a do 1º caderno.
  v_get := public.get_gabarito_prova(v_slug);
  if jsonb_array_length(v_get->'cadernos') <> 3
     or v_get->'cadernos'->1->>'nome' <> 'Verde'
     or v_get->'cadernos'->1->'questoes'->0->>'resposta' <> 'D'
     or v_get->'questoes'->0->>'resposta' <> 'A' then
    raise exception 'FALHA: get_gabarito_prova não devolve os cadernos corretamente';
  end if;

  -- Renomear preserva id e slug (o link já circulou); o que sai do payload é
  -- excluído com a folha; caderno novo entra com slug próprio e vai ao fim.
  v_r2 := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'id', v_g, 'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2', 'qtd_alternativas', 5,
    'cadernos', jsonb_build_array(
      jsonb_build_object('id', v_verde, 'nome', 'Caderno Verde', 'questoes', v_folha_b),
      jsonb_build_object('id', v_azul, 'nome', 'Azul', 'questoes', v_folha_a),
      jsonb_build_object('nome', 'Branco', 'questoes', v_folha_a))));
  if (v_r2->'cadernos'->0->>'id')::uuid <> v_verde or v_r2->'cadernos'->0->>'slug' <> 'verde'
     or v_r2->'cadernos'->0->>'nome' <> 'Caderno Verde' or (v_r2->'cadernos'->0->>'ordem')::int <> 1 then
    raise exception 'FALHA: renomear/reordenar caderno mudou id ou slug (%)', v_r2->'cadernos';
  end if;
  if exists (select 1 from public.gabarito_prova_caderno where id = v_amarelo)
     or exists (select 1 from public.gabarito_prova_questao where caderno_id = v_amarelo) then
    raise exception 'FALHA: caderno removido do payload continuou no banco';
  end if;
  if (select count(*) from public.gabarito_prova_caderno where gabarito_id = v_g) <> 3 then
    raise exception 'FALHA: esperava 3 cadernos depois do segundo save';
  end if;

  -- Validações
  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'id', v_g, 'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2',
      'cadernos', jsonb_build_array(
        jsonb_build_object('nome', 'Azul', 'questoes', v_folha_a),
        jsonb_build_object('nome', ' AZUL ', 'questoes', v_folha_a))));
    raise exception 'FALHA: aceitou nome de caderno repetido';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'nome_caderno_repetido' then raise; end if;
  end;

  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2',
      'cadernos', jsonb_build_array(jsonb_build_object('nome', '  ', 'questoes', v_folha_a))));
    raise exception 'FALHA: aceitou caderno sem nome';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'nome_caderno_invalido' then raise; end if;
  end;

  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2',
      'cadernos', jsonb_build_array(
        jsonb_build_object('nome', 'A', 'questoes', v_folha_a),
        jsonb_build_object('nome', 'B', 'questoes', jsonb_build_array(jsonb_build_object('numero', 1))))));
    raise exception 'FALHA: aceitou cadernos com quantidades de questões diferentes';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'cadernos_tamanhos_diferentes' then raise; end if;
  end;

  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2',
      'cadernos', '[]'::jsonb));
    raise exception 'FALHA: aceitou gabarito sem caderno';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'quantidade_cadernos_invalida' then raise; end if;
  end;

  -- Caderno de OUTRO gabarito não pode ser "adotado" pelo payload.
  v_outro := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'tipo_prova', 'Teste Cad Outro', 'periodo', 7, 'semestre', '2026.2',
    'cadernos', jsonb_build_array(jsonb_build_object('nome', 'Único', 'questoes', v_folha_a))));
  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'id', v_g, 'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2',
      'cadernos', jsonb_build_array(jsonb_build_object(
        'id', v_outro->'cadernos'->0->>'id', 'nome', 'Roubado', 'questoes', v_folha_a))));
    raise exception 'FALHA: aceitou id de caderno de outro gabarito';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'caderno_invalido' then raise; end if;
  end;

  -- Payload antigo (questoes na raiz) só vale com um caderno.
  begin
    perform public.admin_salvar_gabarito_prova(jsonb_build_object(
      'id', v_g, 'tipo_prova', 'Teste Cad', 'periodo', 7, 'semestre', '2026.2',
      'questoes', v_folha_a));
    raise exception 'FALHA: payload legado sobrescreveu gabarito com vários cadernos';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'cadernos_obrigatorio' then raise; end if;
  end;
  v_r2 := public.admin_salvar_gabarito_prova(jsonb_build_object(
    'id', (v_outro->>'id')::uuid, 'tipo_prova', 'Teste Cad Outro', 'periodo', 7, 'semestre', '2026.2',
    'questoes', v_folha_b));
  if (v_r2->'cadernos'->0->>'id') <> (v_outro->'cadernos'->0->>'id')
     or (select resposta from public.gabarito_prova_questao
          where caderno_id = (v_r2->'cadernos'->0->>'id')::uuid and numero = 1) <> 'D' then
    raise exception 'FALHA: payload legado não atualizou o caderno único';
  end if;

  -- Vitrine: nomes dos cadernos, nenhuma letra/comentário em lugar nenhum.
  perform public.admin_publicar_gabarito_prova(v_g, true, false);
  v_vit := public.get_gabarito_prova_vitrine(v_slug);
  if jsonb_array_length(v_vit->'cadernos') <> 3 or v_vit->'cadernos'->0->>'nome' <> 'Caderno Verde'
     or (v_vit->>'total_questoes')::int <> 3 then
    raise exception 'FALHA: vitrine sem os cadernos ou com contagem errada (%)', v_vit;
  end if;
  if v_vit->'cadernos'->0 ?| array['questoes', 'resposta', 'comentario']
     or v_vit ?| array['questoes', 'resposta', 'comentario', 'observacao'] then
    raise exception 'FALHA: vitrine expõe conteúdo do gabarito';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.listar_gabaritos_provas(7)) e
     where e->>'slug' = v_slug and jsonb_array_length(e->'cadernos') = 3 and (e->>'total_questoes')::int = 3
  ) then
    raise exception 'FALHA: lista pública sem os cadernos (ou total_questoes somando cadernos)';
  end if;

  -- Lista do admin: progresso por caderno.
  if not exists (
    select 1 from jsonb_array_elements(public.admin_listar_gabaritos_provas()) e
     where e->>'slug' = v_slug
       and (e->>'total_questoes')::int = 9
       and jsonb_array_length(e->'cadernos') = 3
       and (e->'cadernos'->0->>'total_preenchidas')::int = 2
  ) then
    raise exception 'FALHA: lista do admin sem progresso por caderno';
  end if;

  -- Excluir o gabarito leva os cadernos e as folhas junto.
  perform public.admin_excluir_gabarito_prova(v_g);
  if exists (select 1 from public.gabarito_prova_caderno where gabarito_id = v_g)
     or exists (select 1 from public.gabarito_prova_questao where gabarito_id = v_g) then
    raise exception 'FALHA: excluir o gabarito deixou caderno/folha órfãos';
  end if;

  raise notice 'OK 7: cadernos (folha própria, rename preserva slug, remoção, validações, vitrine sem letras, legado, cascade)';
end $$;

reset role;

rollback;
