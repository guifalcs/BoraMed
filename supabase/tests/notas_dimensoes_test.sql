-- ============================================================================
-- Teste do módulo "Minhas notas" (dimensões de nota por período).
--
-- O QUE VALIDA
--   1. `anon` sem privilégio; `authenticated` sem escrita direta nas tabelas;
--      RPCs de admin fora do alcance de `anon`; helper de JSON fechado;
--   2. regulamentos do 1º e 2º período (migration de dados) somam 100 por
--      dimensão e estão publicados;
--   3. aluno sem período recebe `regulamento: null`; aluno do 1º recebe o
--      regulamento do 1º e não lê a estrutura direto da tabela;
--   4. lançamento: só em item-folha, dentro de 0..pontos, só do regulamento do
--      próprio período; NULL apaga; um aluno não vê nota do outro;
--   5. aluno não executa RPC de admin (42501);
--   6. admin salva árvore nova (subitens precisam somar), edita preservando
--      ids (nota do aluno sobrevive), remove item com nota (contabiliza),
--      publica arquivando o anterior do período e notifica uma vez só;
--   7. limpar_minhas_notas apaga só as notas do próprio aluno.
--
-- Roda dentro de transação com ROLLBACK: não deixa resíduo no banco.
--
-- COMO RODAR (stack local):
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/notas_dimensoes_test.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ─── 1) Privilégios ─────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['notas_regulamento', 'notas_eixo', 'notas_dimensao', 'notas_item', 'notas_lancamento'] loop
    if has_table_privilege('anon', 'public.' || t, 'select') then
      raise exception 'FALHA: anon tem SELECT em %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'update')
       or has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception 'FALHA: authenticated escreve direto em % (deveria ser só RPC)', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.admin_salvar_notas_regulamento(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.admin_publicar_notas_regulamento(uuid, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'public.admin_excluir_notas_regulamento(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_listar_notas_regulamentos()', 'execute')
     or has_function_privilege('anon', 'public.get_minhas_notas()', 'execute')
     or has_function_privilege('anon', 'public.salvar_nota_lancamento(uuid, numeric)', 'execute')
     or has_function_privilege('authenticated', 'public.notas_regulamento_json(uuid)', 'execute') then
    raise exception 'FALHA: RPC exposta a quem não devia';
  end if;
  raise notice 'OK 1: privilégios';
end $$;

-- ─── 2) Conteúdo do 1º e 2º período ────────────────────────────────────────
do $$
begin
  if (select count(*) from public.notas_regulamento
       where periodo in (1, 2) and semestre = '2026.2' and status = 'publicado') <> 2 then
    raise exception 'FALHA: regulamentos do 1º/2º período ausentes ou não publicados';
  end if;
  if exists (
    select 1
      from public.notas_dimensao d
      join public.notas_eixo e on e.id = d.eixo_id
      join public.notas_regulamento r on r.id = e.regulamento_id
     where r.periodo in (1, 2) and r.semestre = '2026.2'
       and (select sum(i.pontos) from public.notas_item i where i.dimensao_id = d.id and i.pai_id is null) <> 100
  ) then
    raise exception 'FALHA: alguma dimensão do 1º/2º período não soma 100';
  end if;
  if exists (
    select 1 from public.notas_item p
     where exists (select 1 from public.notas_item s where s.pai_id = p.id)
       and p.pontos <> (select sum(s.pontos) from public.notas_item s where s.pai_id = p.id)
  ) then
    raise exception 'FALHA: subitens não somam o item pai';
  end if;
  if (select exame_especial from public.notas_eixo e
        join public.notas_regulamento r on r.id = e.regulamento_id
       where r.periodo = 1 and e.sigla = 'PIEPE I') then
    raise exception 'FALHA: PIEPE I não tem exame especial';
  end if;
  raise notice 'OK 2: conteúdo 1º/2º período';
end $$;

-- Fixture: admin, aluno do 1º, aluno do 1º (B) e aluno sem período.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('9ab0f000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'notas-test-admin@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0f000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'notas-test-aluno@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0f000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'notas-test-aluno-b@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('9ab0f000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'notas-test-sem-periodo@boramed.test', '', now(), '{"provider":"email"}', '{}', now(), now());
update public.profiles set papel = 'admin', periodo = 9 where id = '9ab0f000-0000-0000-0000-00000000b001';
update public.profiles set papel = 'aluno', periodo = 1 where id in ('9ab0f000-0000-0000-0000-00000000b002', '9ab0f000-0000-0000-0000-00000000b003');
update public.profiles set papel = 'aluno', periodo = null where id = '9ab0f000-0000-0000-0000-00000000b004';

create temp table _ctx (
  admin_id uuid, aluno_id uuid, aluno_b_id uuid, sem_periodo_id uuid,
  folha_n1 uuid, pai_apg uuid, folha_apg1 uuid, folha_p2 uuid
) on commit drop;
insert into _ctx (admin_id, aluno_id, aluno_b_id, sem_periodo_id, folha_n1, pai_apg, folha_apg1, folha_p2)
select '9ab0f000-0000-0000-0000-00000000b001', '9ab0f000-0000-0000-0000-00000000b002',
       '9ab0f000-0000-0000-0000-00000000b003', '9ab0f000-0000-0000-0000-00000000b004',
       (select i.id from public.notas_item i join public.notas_dimensao d on d.id = i.dimensao_id
          join public.notas_eixo e on e.id = d.eixo_id join public.notas_regulamento r on r.id = e.regulamento_id
         where r.periodo = 1 and r.status = 'publicado' and e.sigla = 'SOI I' and i.nome = 'Prova N1'),
       (select i.id from public.notas_item i join public.notas_dimensao d on d.id = i.dimensao_id
          join public.notas_eixo e on e.id = d.eixo_id join public.notas_regulamento r on r.id = e.regulamento_id
         where r.periodo = 1 and r.status = 'publicado' and e.sigla = 'SOI I' and i.nome = 'Avaliação Diária na APG'),
       (select s.id from public.notas_item s join public.notas_item i on i.id = s.pai_id
          join public.notas_dimensao d on d.id = i.dimensao_id
          join public.notas_eixo e on e.id = d.eixo_id join public.notas_regulamento r on r.id = e.regulamento_id
         where r.periodo = 1 and r.status = 'publicado' and e.sigla = 'SOI I' and i.nome = 'Avaliação Diária na APG'
           and s.nome = '1ª parcial'),
       (select i.id from public.notas_item i join public.notas_dimensao d on d.id = i.dimensao_id
          join public.notas_eixo e on e.id = d.eixo_id join public.notas_regulamento r on r.id = e.regulamento_id
         where r.periodo = 2 and r.status = 'publicado' and e.sigla = 'SOI II' and i.nome = 'Prova N1');
grant select, update on _ctx to authenticated, anon;

-- ─── 3) Aluno sem período ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select sem_periodo_id from _ctx), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.get_minhas_notas();
  if v->'regulamento' <> 'null'::jsonb or v->'periodo' <> 'null'::jsonb then
    raise exception 'FALHA: aluno sem período recebeu regulamento (%)', v;
  end if;
  if not (v->'periodos_disponiveis' @> '[1, 2]'::jsonb) then
    raise exception 'FALHA: periodos_disponiveis não lista 1 e 2 (%)', v->'periodos_disponiveis';
  end if;
  raise notice 'OK 3a: aluno sem período orientado';
end $$;

-- ─── 3/4) Aluno do 1º período ──────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select aluno_id from _ctx), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; v_err text; v_ctx _ctx%rowtype;
begin
  select * into v_ctx from _ctx;
  v := public.get_minhas_notas();
  if (v->>'periodo')::int <> 1 or (v->'regulamento'->>'periodo')::int <> 1
     or jsonb_array_length(v->'regulamento'->'eixos') <> 5 then
    raise exception 'FALHA: regulamento do 1º período não veio (%)', left(v::text, 200);
  end if;
  if exists (select 1 from public.notas_regulamento) then
    raise exception 'FALHA: aluno lê notas_regulamento direto';
  end if;

  perform public.salvar_nota_lancamento(v_ctx.folha_n1, 17.456);
  if (select nota from public.notas_lancamento where item_id = v_ctx.folha_n1) <> 17.46 then
    raise exception 'FALHA: nota não arredondou para 2 casas';
  end if;
  perform public.salvar_nota_lancamento(v_ctx.folha_n1, 18);
  perform public.salvar_nota_lancamento(v_ctx.folha_apg1, 19.5);
  -- usada no bloco 6 (redução de pontos abaixo da nota)
  -- (o aluno não lê a estrutura direto: o id vem do JSON de get_minhas_notas)
  perform public.salvar_nota_lancamento(
    (v->'regulamento' #>> '{eixos,0,dimensoes,1,itens,1,subitens,0,id}')::uuid, 14);

  begin
    perform public.salvar_nota_lancamento(v_ctx.folha_n1, 20.01);
    raise exception 'FALHA: aceitou nota acima do peso';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'nota_fora_do_intervalo' then raise; end if;
  end;
  begin
    perform public.salvar_nota_lancamento(v_ctx.folha_n1, -1);
    raise exception 'FALHA: aceitou nota negativa';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'nota_fora_do_intervalo' then raise; end if;
  end;
  begin
    perform public.salvar_nota_lancamento(v_ctx.pai_apg, 30);
    raise exception 'FALHA: aceitou nota em item com subitens';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'item_tem_subitens' then raise; end if;
  end;
  begin
    perform public.salvar_nota_lancamento(v_ctx.folha_p2, 10);
    raise exception 'FALHA: aceitou nota em regulamento de outro período';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'regulamento_indisponivel' then raise; end if;
  end;

  v := public.get_minhas_notas();
  if jsonb_array_length(v->'lancamentos') <> 3 then
    raise exception 'FALHA: esperava 3 lançamentos, veio %', v->'lancamentos';
  end if;

  -- NULL apaga.
  perform public.salvar_nota_lancamento(v_ctx.folha_apg1, null);
  if exists (select 1 from public.notas_lancamento where item_id = v_ctx.folha_apg1) then
    raise exception 'FALHA: NULL não apagou o lançamento';
  end if;
  perform public.salvar_nota_lancamento(v_ctx.folha_apg1, 19.5);

  -- 5) RPC de admin.
  begin
    perform public.admin_listar_notas_regulamentos();
    raise exception 'FALHA: aluno listou regulamentos de admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_salvar_notas_regulamento('{"periodo":1,"semestre":"2026.2","eixos":[]}'::jsonb);
    raise exception 'FALHA: aluno salvou regulamento';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 3b/4/5: aluno lê o próprio período e lança com validação';
end $$;

-- Aluno B não vê nota do aluno A.
select set_config('request.jwt.claims',
  json_build_object('sub', (select aluno_b_id from _ctx), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.notas_lancamento) then
    raise exception 'FALHA: aluno B enxerga lançamento do aluno A';
  end if;
  if jsonb_array_length(public.get_minhas_notas()->'lancamentos') <> 0 then
    raise exception 'FALHA: get_minhas_notas trouxe nota de outro aluno';
  end if;
  perform public.salvar_nota_lancamento((select folha_n1 from _ctx), 12);
  raise notice 'OK 4b: isolamento entre alunos';
end $$;

-- ─── 6) Admin ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id from _ctx), 'role', 'authenticated')::text, true);
do $$
declare
  v_ctx _ctx%rowtype; v_err text; v_s jsonb; v_reg jsonb; v_novo jsonb; v_pub jsonb; v_pub2 jsonb;
  v_lista jsonb; v_payload jsonb; v_id uuid; v_esperado int;
begin
  select * into v_ctx from _ctx;

  -- Subitens que não somam.
  begin
    perform public.admin_salvar_notas_regulamento(jsonb_build_object(
      'periodo', 9, 'semestre', '2027.1',
      'eixos', jsonb_build_array(jsonb_build_object('sigla', 'X', 'nome', 'Eixo X',
        'dimensoes', jsonb_build_array(jsonb_build_object('tipo', 'unica',
          'itens', jsonb_build_array(jsonb_build_object('nome', 'A', 'pontos', 10,
            'subitens', jsonb_build_array(jsonb_build_object('nome', 'a1', 'pontos', 4), jsonb_build_object('nome', 'a2', 'pontos', 5))))))))));
    raise exception 'FALHA: aceitou subitens que não somam o pai';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'subitens_nao_somam' then raise; end if;
  end;

  -- Única junto de outra dimensão.
  begin
    perform public.admin_salvar_notas_regulamento(jsonb_build_object(
      'periodo', 9, 'semestre', '2027.1',
      'eixos', jsonb_build_array(jsonb_build_object('sigla', 'X', 'nome', 'Eixo X',
        'dimensoes', jsonb_build_array(
          jsonb_build_object('tipo', 'unica', 'itens', jsonb_build_array(jsonb_build_object('nome', 'A', 'pontos', 100))),
          jsonb_build_object('tipo', 'cognitiva', 'itens', jsonb_build_array(jsonb_build_object('nome', 'B', 'pontos', 100))))))));
    raise exception 'FALHA: aceitou dimensão única com outra';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'tipos_dimensao_invalidos' then raise; end if;
  end;

  -- Cria um rascunho novo do 1º período (próximo semestre) e publica:
  -- o 2026.2 vira arquivado.
  v_s := public.admin_salvar_notas_regulamento(jsonb_build_object(
    'periodo', 1, 'semestre', '2027.1',
    'eixos', jsonb_build_array(jsonb_build_object('sigla', 'SOI I', 'nome', 'Sistemas', 'exame_especial', true,
      'dimensoes', jsonb_build_array(
        jsonb_build_object('tipo', 'cognitiva', 'itens', jsonb_build_array(
          jsonb_build_object('nome', 'N1', 'pontos', 50), jsonb_build_object('nome', 'N2', 'pontos', 50))),
        jsonb_build_object('tipo', 'habilidades', 'itens', jsonb_build_array(
          jsonb_build_object('nome', 'APG', 'pontos', 100,
            'subitens', jsonb_build_array(jsonb_build_object('nome', 'p1', 'pontos', 60), jsonb_build_object('nome', 'p2', 'pontos', 40))))))))));
  v_id := (v_s->>'id')::uuid;
  if v_s->>'status' <> 'rascunho' then
    raise exception 'FALHA: regulamento novo não nasceu rascunho';
  end if;

  v_pub := public.admin_publicar_notas_regulamento(v_id, true, true);
  if v_pub->>'arquivado_id' is null then
    raise exception 'FALHA: publicar não arquivou o anterior do período';
  end if;
  if (v_pub->>'notificados')::int < 2 then
    raise exception 'FALHA: não notificou os alunos do 1º período (%)', v_pub;
  end if;
  v_pub2 := public.admin_publicar_notas_regulamento(v_id, true, true);
  if (v_pub2->>'notificados')::int <> 0 then
    raise exception 'FALHA: notificou duas vezes';
  end if;

  -- Volta o 2026.2 ao ar para os testes de edição.
  perform public.admin_publicar_notas_regulamento((v_pub->>'arquivado_id')::uuid, true, false);

  -- Edição preservando ids: renomeia a N1 do SOI I (nota do aluno fica) e
  -- remove a 2ª parcial da APG… o que exige ajustar os pontos da 1ª.
  v_reg := public.admin_get_notas_regulamento((v_pub->>'arquivado_id')::uuid);
  -- (o seed local pode ter mais alunos com nota: compara com a tabela)
  if (v_reg->'lancamentos_por_item'->>(v_ctx.folha_n1::text))::int
     <> (select count(*) from public.notas_lancamento where item_id = v_ctx.folha_n1) then
    raise exception 'FALHA: lancamentos_por_item não contou a N1 (%)', v_reg->'lancamentos_por_item';
  end if;

  v_payload := v_reg - 'lancamentos_por_item';
  -- eixo 0 = SOI I; dimensão 0 = cognitiva; item 0 = Prova N1
  v_payload := jsonb_set(v_payload, '{eixos,0,dimensoes,0,itens,0,nome}', '"Prova N1 (renomeada)"');
  -- dimensão 1 = habilidades; item 0 = APG (35) com subitens 20 + 15 → fica só a 1ª, 35 pts sem subitens
  v_payload := jsonb_set(v_payload, '{eixos,0,dimensoes,1,itens,0,subitens}', '[]'::jsonb);
  v_esperado := (select count(*) from public.notas_lancamento l join public.notas_item s on s.id = l.item_id
                   where s.pai_id = (v_payload #>> '{eixos,0,dimensoes,1,itens,0,id}')::uuid);
  v_novo := public.admin_salvar_notas_regulamento(v_payload);
  if (v_novo->>'lancamentos_removidos')::int <> v_esperado or v_esperado < 1 then
    raise exception 'FALHA: esperava % lançamento(s) removido(s) da APG, veio %', v_esperado, v_novo;
  end if;
  if (select nome from public.notas_item where id = v_ctx.folha_n1) <> 'Prova N1 (renomeada)' then
    raise exception 'FALHA: item não preservou o id ao renomear';
  end if;
  if (select count(*) from public.notas_lancamento where item_id = v_ctx.folha_n1) < 2 then
    raise exception 'FALHA: notas da N1 se perderam na edição';
  end if;

  -- Item com nota que vira pai: a nota sai e entra na contagem. TPI (30) tem
  -- 0 notas; Prova N1 renomeada (20) tem 2 → divide em 10 + 10.
  v_payload := jsonb_set(v_payload, '{eixos,0,dimensoes,0,itens,0,subitens}',
    '[{"nome":"a","pontos":10},{"nome":"b","pontos":10}]'::jsonb);
  v_esperado := (select count(*) from public.notas_lancamento where item_id = v_ctx.folha_n1);
  v_novo := public.admin_salvar_notas_regulamento(v_payload);
  if (v_novo->>'lancamentos_removidos')::int <> v_esperado then
    raise exception 'FALHA: dividir item com nota não contou as % notas apagadas (%)', v_esperado, v_novo;
  end if;
  if exists (select 1 from public.notas_lancamento where item_id = v_ctx.folha_n1) then
    raise exception 'FALHA: nota ficou presa num item que virou pai';
  end if;

  -- Pontos reduzidos abaixo da nota lançada: a nota sai e é contada.
  -- (a nota do aluno A na N1 já saiu; usa a 1ª multiestação do SOI I)
  v_reg := public.admin_get_notas_regulamento((v_pub->>'arquivado_id')::uuid);
  v_payload := v_reg - 'lancamentos_por_item';
  v_payload := jsonb_set(v_payload, '{eixos,0,dimensoes,1,itens,1,subitens,0,pontos}', '10');
  v_payload := jsonb_set(v_payload, '{eixos,0,dimensoes,1,itens,1,pontos}', '25');
  v_esperado := (select count(*) from public.notas_lancamento l join public.notas_item s on s.id = l.item_id
                   where s.id = (v_payload #>> '{eixos,0,dimensoes,1,itens,1,subitens,0,id}')::uuid and l.nota > 10);
  v_novo := public.admin_salvar_notas_regulamento(v_payload);
  if (v_novo->>'lancamentos_removidos')::int <> v_esperado or v_esperado < 1 then
    raise exception 'FALHA: nota acima do novo peso não foi removida/contada (esperado %, %)', v_esperado, v_novo;
  end if;

  -- Regulamento no ar não é excluído direto.
  begin
    perform public.admin_excluir_notas_regulamento((v_pub->>'arquivado_id')::uuid);
    raise exception 'FALHA: excluiu regulamento publicado';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'regulamento_publicado' then raise; end if;
  end;

  -- Id de outro regulamento no payload é recusado.
  begin
    perform public.admin_salvar_notas_regulamento(jsonb_set(v_payload, '{eixos,0,dimensoes,0,itens,0,id}', to_jsonb(v_ctx.folha_p2::text)));
    raise exception 'FALHA: aceitou item de outro regulamento';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'estrutura_invalida' then raise; end if;
  end;

  v_lista := public.admin_listar_notas_regulamentos();
  if jsonb_array_length(v_lista) < 3 then
    raise exception 'FALHA: lista de admin incompleta';
  end if;

  perform public.admin_excluir_notas_regulamento(v_id);
  if exists (select 1 from public.notas_regulamento where id = v_id) then
    raise exception 'FALHA: exclusão não removeu';
  end if;
  raise notice 'OK 6: admin valida, preserva ids, publica/arquiva e notifica uma vez';
end $$;

-- ─── 7) Limpar as próprias notas ───────────────────────────────────────────
-- Os dois alunos lançam no TPI do SOI I; A limpa e só a dele some.
do $$
declare v_tpi uuid;
begin
  select i.id into v_tpi from public.notas_item i join public.notas_dimensao d on d.id = i.dimensao_id
    join public.notas_eixo e on e.id = d.eixo_id join public.notas_regulamento r on r.id = e.regulamento_id
   where r.periodo = 1 and r.status = 'publicado' and e.sigla = 'SOI I' and i.nome = 'TPI';
  update _ctx set folha_n1 = v_tpi;
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select aluno_b_id from _ctx), 'role', 'authenticated')::text, true);
select public.salvar_nota_lancamento((select folha_n1 from _ctx), 20);
select set_config('request.jwt.claims',
  json_build_object('sub', (select aluno_id from _ctx), 'role', 'authenticated')::text, true);
select public.salvar_nota_lancamento((select folha_n1 from _ctx), 25);
do $$
declare v_n int;
begin
  v_n := public.limpar_minhas_notas((public.get_minhas_notas()->'regulamento'->>'id')::uuid);
  if v_n <> 1 then
    raise exception 'FALHA: esperava apagar 1 nota do aluno A, apagou %', v_n;
  end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.notas_lancamento where user_id = '9ab0f000-0000-0000-0000-00000000b003') <> 1 then
    raise exception 'FALHA: limpar apagou nota de outro aluno';
  end if;
  raise notice 'OK 7: limpar só as próprias notas';
end $$;

rollback;
