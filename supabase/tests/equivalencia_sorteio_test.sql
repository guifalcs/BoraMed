-- ============================================================================
-- Teste de regressão: dedup abertas×fechadas + rodízio group-aware no sorteio
-- (migrations 20260708130000 / 20260708140000, ADR-030).
--
-- Determinístico. Roda contra o stack LOCAL após `supabase db reset --local`
-- (usa o usuário admin com assinatura ativa do seed: teste@boramed.com).
--
-- Como rodar:
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/equivalencia_sorteio_test.sql
--
-- Cada teste roda em sua própria transação (BEGIN/ROLLBACK) para não poluir o
-- histórico do usuário nem o banco. Falha => RAISE EXCEPTION (psql sai != 0).
-- auth.uid() é resolvido via request.jwt.claims (não precisa trocar de role;
-- postgres executa a RPC SECURITY DEFINER e a função lê o sub do JWT).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 1 — DEDUP: no formato 'misto', o par gêmeo (fechada + discursiva)
-- nunca aparece junto; o grupo entra no simulado como UMA questão.
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';  -- teste@boramed.com (seed)
  v_disc uuid;
  v_tema uuid;
  v_grupo uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid();  -- fechada gêmea
  v_b uuid := gen_random_uuid();  -- discursiva gêmea
  v_std uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_res jsonb;
  v_ids uuid[];
  v_tem_a boolean;
  v_tem_b boolean;
  v_total int;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.tema (nome, disciplina_id) values ('TEST_EQUIV_dedup', v_disc) returning id into v_tema;

  -- par gêmeo (mesmo grupo)
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'processual', 'ativa', v_disc, v_grupo),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'processual', 'ativa', v_disc, v_grupo);
  -- 3 fechadas isoladas (grupos distintos)
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id)
  select unnest(v_std), 'ISOLADA', 'multipla_escolha', 'processual', 'ativa', v_disc;

  insert into public.questao_tema (questao_id, tema_id)
  select unnest(array[v_a, v_b] || v_std), v_tema;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- misto, pedindo muito mais que o pool do tema => pega tudo que puder
  v_res := public.gerar_simulado_personalizado(array[v_tema], 50, 'estudo', null, null, 'misto');
  v_ids := array(select (x->>'id')::uuid from jsonb_array_elements(v_res->'questoes') x);

  v_tem_a := v_a = any(v_ids);
  v_tem_b := v_b = any(v_ids);
  v_total := coalesce(array_length(v_ids, 1), 0);

  if v_tem_a and v_tem_b then
    raise exception 'FALHA dedup: fechada E discursiva gêmeas vieram no mesmo simulado (%).', v_ids;
  end if;
  if not (v_tem_a or v_tem_b) then
    raise exception 'FALHA dedup: nenhuma variante do grupo apareceu (esperado exatamente uma). ids=%', v_ids;
  end if;
  -- 3 isoladas + 1 do grupo = 4
  if v_total <> 4 then
    raise exception 'FALHA dedup: esperado 4 questões (3 isoladas + 1 do grupo), veio %. ids=%', v_total, v_ids;
  end if;

  raise notice 'OK TESTE 1 (dedup misto): % questões, exatamente 1 do par gêmeo.', v_total;
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 2 — RODÍZIO GROUP-AWARE (cross-format): o aluno respondeu a DISCURSIVA
-- gêmea (B). Ao montar simulado de FECHADAS, a fechada gêmea (A) é tratada como
-- "já vista" (mesmo grupo) e fica de fora quando há inéditas suficientes.
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_disc uuid;
  v_tema uuid;
  v_grupo uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid();  -- fechada gêmea (NUNCA entregue diretamente)
  v_b uuid := gen_random_uuid();  -- discursiva gêmea (entregue ao aluno)
  v_std uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];  -- 3 fechadas inéditas
  v_prova uuid;
  v_tent uuid;
  v_res jsonb;
  v_ids uuid[];
  v_total int;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.tema (nome, disciplina_id) values ('TEST_EQUIV_rodizio', v_disc) returning id into v_tema;

  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'processual', 'ativa', v_disc, v_grupo),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'processual', 'ativa', v_disc, v_grupo);
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id)
  select unnest(v_std), 'ISOLADA', 'multipla_escolha', 'processual', 'ativa', v_disc;
  insert into public.questao_tema (questao_id, tema_id)
  select unnest(array[v_a, v_b] || v_std), v_tema;

  -- Pré-entrega: aluno JÁ respondeu a discursiva gêmea (B) numa tentativa real.
  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('hist', 0, 'autoral', 'personalizado', 1, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'simulado', 'finalizada', 1, 1, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa) values (v_tent, v_b, 1);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- FECHADAS, pedindo exatamente o nº de inéditas (3). Candidatos por grupo: 3
  -- isoladas (inéditas) + A (grupo entregue via B). Ordena inéditas primeiro =>
  -- A deve ficar de fora.
  v_res := public.gerar_simulado_personalizado(array[v_tema], 3, 'estudo', null, null, 'fechadas');
  v_ids := array(select (x->>'id')::uuid from jsonb_array_elements(v_res->'questoes') x);
  v_total := coalesce(array_length(v_ids, 1), 0);

  if v_a = any(v_ids) then
    raise exception 'FALHA rodízio: a fechada gêmea (A) entrou apesar de a discursiva gêmea (B) já ter sido feita. ids=%', v_ids;
  end if;
  if v_total <> 3 then
    raise exception 'FALHA rodízio: esperado 3 inéditas, veio %. ids=%', v_total, v_ids;
  end if;
  if not (v_std <@ v_ids) then
    raise exception 'FALHA rodízio: as 3 inéditas deveriam ter sido priorizadas. ids=%', v_ids;
  end if;

  raise notice 'OK TESTE 2 (rodízio cross-format): fechada gêmea deprioritizada por causa da discursiva já feita.';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 3 — SOFT: se NÃO há inéditas suficientes, a gêmea "já vista" ainda
-- entra (o pool nunca seca).
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_disc uuid;
  v_tema uuid;
  v_grupo uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_prova uuid;
  v_tent uuid;
  v_res jsonb;
  v_ids uuid[];
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.tema (nome, disciplina_id) values ('TEST_EQUIV_soft', v_disc) returning id into v_tema;
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'processual', 'ativa', v_disc, v_grupo),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'processual', 'ativa', v_disc, v_grupo);
  insert into public.questao_tema (questao_id, tema_id) values (v_a, v_tema), (v_b, v_tema);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('hist', 0, 'autoral', 'personalizado', 1, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'simulado', 'finalizada', 1, 1, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa) values (v_tent, v_b, 1);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- Só há o grupo gêmeo (todo "visto") no tema. FECHADAS deve ainda entregar A.
  v_res := public.gerar_simulado_personalizado(array[v_tema], 5, 'estudo', null, null, 'fechadas');
  v_ids := array(select (x->>'id')::uuid from jsonb_array_elements(v_res->'questoes') x);

  if not (v_a = any(v_ids)) then
    raise exception 'FALHA soft: sem inéditas, a gêmea vista deveria entrar mesmo assim. ids=%', v_ids;
  end if;
  raise notice 'OK TESTE 3 (soft): pool não seca — gêmea já vista reaproveitada quando não há inéditas.';
end $$;
rollback;
