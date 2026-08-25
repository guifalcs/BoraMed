-- ============================================================================
-- Teste de regressão: troca de formato em tempo de prova (fechada ⇄ discursiva)
-- migration 20260824190000_troca_formato_gemea_tentativa.sql
--
-- Determinístico. Roda contra o stack LOCAL após `supabase db reset --local`
-- (usa o usuário admin do seed: teste@boramed.com → nivel_acesso = 'avancado').
--
-- Como rodar:
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/troca_formato_gemea_test.sql
--
-- Cada teste roda em sua própria transação (BEGIN/ROLLBACK). Falha =>
-- RAISE EXCEPTION (psql sai != 0). auth.uid() vem de request.jwt.claims.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 1 — TROCA FELIZ: fechada → discursiva. Linha da tentativa aponta para
-- a gêmea, resposta antiga é limpa, ordem preservada e o payload volta
-- MASCARADO (modo simulado não entrega gabarito da gêmea).
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_disc  uuid;
  v_tema  uuid;
  v_grupo uuid := gen_random_uuid();
  v_a     uuid := gen_random_uuid();  -- fechada
  v_b     uuid := gen_random_uuid();  -- discursiva gêmea
  v_prova uuid;
  v_tent  uuid;
  v_res   jsonb;
  v_tr    public.tentativa_resposta;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.tema (nome, disciplina_id) values ('TEST_TROCA_feliz', v_disc) returning id into v_tema;

  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id,
                              resposta_modelo, pontos_chave, criterios_correcao)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'laboratorio', 'ativa', v_disc, v_grupo, null, '[]'::jsonb, null),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'laboratorio', 'ativa', v_disc, v_grupo,
          'SEGREDO resposta modelo', '["SEGREDO ponto"]'::jsonb, 'SEGREDO criterios');
  insert into public.alternativa (questao_id, letra, texto, correta, ordem)
  values (v_a, 'A', 'alt A', true, 1), (v_a, 'B', 'alt B', false, 2);
  insert into public.questao_tema (questao_id, tema_id) values (v_a, v_tema), (v_b, v_tema);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('TEST_TROCA', 0, 'autoral', 'personalizado', 1, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'simulado', 'em_andamento', 1, 0, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa, resposta_texto)
  values (v_tent, v_a, 7, 'rascunho antigo');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- get_gemeas_tentativa enxerga o par ANTES da troca
  v_res := public.get_gemeas_tentativa(v_tent);
  if jsonb_array_length(v_res) <> 1 then
    raise exception 'FALHA mapa: esperado 1 par gêmeo, veio %', v_res;
  end if;
  if (v_res->0->>'gemea_id')::uuid <> v_b or v_res->0->>'formato_gemea' <> 'resposta_aberta_curta' then
    raise exception 'FALHA mapa: gêmea errada. %', v_res;
  end if;

  v_res := public.trocar_formato_questao_tentativa(v_tent, v_a);

  select * into v_tr from public.tentativa_resposta where tentativa_id = v_tent;

  if v_tr.questao_id <> v_b then
    raise exception 'FALHA troca: questao_id ainda é %, esperado %', v_tr.questao_id, v_b;
  end if;
  if v_tr.ordem_na_tentativa <> 7 then
    raise exception 'FALHA troca: ordem_na_tentativa mudou (%), deveria seguir 7', v_tr.ordem_na_tentativa;
  end if;
  if v_tr.resposta_texto is not null or v_tr.alternativa_id is not null or v_tr.correta is not null then
    raise exception 'FALHA troca: resposta antiga sobreviveu (%)', row_to_json(v_tr);
  end if;

  -- Máscara de gabarito em modo simulado
  if v_res->'questao'->>'resposta_modelo' is not null
     or v_res->'questao'->>'criterios_correcao' is not null
     or v_res->'questao'->'pontos_chave' <> '[]'::jsonb then
    raise exception 'FALHA MÁSCARA: gabarito aberto vazou em modo simulado. %', v_res->'questao';
  end if;
  if v_res->'questao'->>'id' <> v_b::text or v_res->'questao'->>'formato' <> 'resposta_aberta_curta' then
    raise exception 'FALHA payload: questão devolvida não é a gêmea. %', v_res->'questao';
  end if;
  if (v_res->'questao'->>'ordem_na_prova')::int <> 7 then
    raise exception 'FALHA payload: ordem devolvida <> 7. %', v_res->'questao';
  end if;

  -- Mapa invertido devolvido junto (a UI não refaz get_gemeas_tentativa)
  if (v_res->'gemea'->>'questao_id')::uuid <> v_b or (v_res->'gemea'->>'gemea_id')::uuid <> v_a then
    raise exception 'FALHA mapa invertido: %', v_res->'gemea';
  end if;

  -- Simetria: dá para voltar ao formato fechado
  v_res := public.trocar_formato_questao_tentativa(v_tent, v_b);
  select * into v_tr from public.tentativa_resposta where tentativa_id = v_tent;
  if v_tr.questao_id <> v_a then
    raise exception 'FALHA volta: esperado voltar para a fechada %, veio %', v_a, v_tr.questao_id;
  end if;
  -- E a fechada volta com o gabarito mascarado
  if v_res->'questao'->'alternativas'->0->>'correta' is not null then
    raise exception 'FALHA MÁSCARA: alternativa.correta vazou em modo simulado. %', v_res->'questao'->'alternativas';
  end if;

  raise notice 'OK TESTE 1 (troca feliz + máscara + simetria).';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 2 — BLOQUEIO: questão já respondida não troca (P0014). Protege o custo
-- de IA já gasto na discursiva enviada e o gabarito já revelado em estudo.
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_disc  uuid;
  v_grupo uuid := gen_random_uuid();
  v_a     uuid := gen_random_uuid();
  v_b     uuid := gen_random_uuid();
  v_prova uuid;
  v_tent  uuid;
  v_erro  text;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'laboratorio', 'ativa', v_disc, v_grupo),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'laboratorio', 'ativa', v_disc, v_grupo);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('TEST_TROCA', 0, 'autoral', 'personalizado', 1, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'simulado', 'em_andamento', 1, 1, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa, respondida_em)
  values (v_tent, v_a, 1, now());

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  begin
    perform public.trocar_formato_questao_tentativa(v_tent, v_a);
    raise exception 'FALHA bloqueio: trocou questão já respondida';
  exception when sqlstate 'P0014' then
    get stacked diagnostics v_erro = message_text;
  end;

  if (select questao_id from public.tentativa_resposta where tentativa_id = v_tent) <> v_a then
    raise exception 'FALHA bloqueio: a linha foi alterada mesmo com o erro';
  end if;

  raise notice 'OK TESTE 2 (respondida não troca): %', v_erro;
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 3 — GUARD DE DUPLICIDADE: se a gêmea já está na tentativa, não troca
-- (não há unique em (tentativa_id, questao_id); sem o guard duplicaria a
-- questão na tela). Também não aparece no mapa.
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_disc  uuid;
  v_grupo uuid := gen_random_uuid();
  v_a     uuid := gen_random_uuid();
  v_b     uuid := gen_random_uuid();
  v_prova uuid;
  v_tent  uuid;
  v_res   jsonb;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'laboratorio', 'ativa', v_disc, v_grupo),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'laboratorio', 'ativa', v_disc, v_grupo);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('TEST_TROCA', 0, 'autoral', 'personalizado', 2, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'simulado', 'em_andamento', 2, 0, 0, now(), now()) returning id into v_tent;
  -- as DUAS variantes na mesma tentativa (o sorteio nunca faz isso, mas prova
  -- montada à mão poderia)
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  values (v_tent, v_a, 1), (v_tent, v_b, 2);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  v_res := public.get_gemeas_tentativa(v_tent);
  if v_res <> '[]'::jsonb then
    raise exception 'FALHA mapa: ofereceu troca para gêmea já presente. %', v_res;
  end if;

  begin
    perform public.trocar_formato_questao_tentativa(v_tent, v_a);
    raise exception 'FALHA guard: trocou para gêmea que já estava na tentativa';
  exception when sqlstate 'P0013' then
    null;
  end;

  if (select count(*) from public.tentativa_resposta where tentativa_id = v_tent) <> 2 then
    raise exception 'FALHA guard: número de questões da tentativa mudou';
  end if;

  raise notice 'OK TESTE 3 (gêmea já presente não é oferecida nem trocada).';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 4 — ELEGIBILIDADE: gêmea arquivada ou anulada pelo admin não é
-- oferecida; questão sem grupo e questão nacional também não.
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_disc  uuid;
  v_g1    uuid := gen_random_uuid();
  v_g2    uuid := gen_random_uuid();
  v_g3    uuid := gen_random_uuid();
  v_arq_f uuid := gen_random_uuid();  -- fechada cuja gêmea está arquivada
  v_arq_a uuid := gen_random_uuid();
  v_anu_f uuid := gen_random_uuid();  -- fechada cuja gêmea está anulada
  v_anu_a uuid := gen_random_uuid();
  v_nac_f uuid := gen_random_uuid();  -- par nacional (não deve ser oferecido)
  v_nac_a uuid := gen_random_uuid();
  v_solo  uuid := gen_random_uuid();  -- sem grupo
  v_prova uuid;
  v_tent  uuid;
  v_res   jsonb;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id, anulada)
  values (v_arq_f, 'f', 'multipla_escolha',      'laboratorio', 'ativa',     v_disc, v_g1, false),
         (v_arq_a, 'a', 'resposta_aberta_curta', 'laboratorio', 'arquivada', v_disc, v_g1, false),
         (v_anu_f, 'f', 'multipla_escolha',      'laboratorio', 'ativa',     v_disc, v_g2, false),
         (v_anu_a, 'a', 'resposta_aberta_curta', 'laboratorio', 'ativa',     v_disc, v_g2, true),
         (v_nac_f, 'f', 'multipla_escolha',      'nacional',    'ativa',     v_disc, v_g3, false),
         (v_nac_a, 'a', 'resposta_aberta_curta', 'nacional',    'ativa',     v_disc, v_g3, false);
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id)
  values (v_solo, 'solo', 'multipla_escolha', 'laboratorio', 'ativa', v_disc);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('TEST_TROCA', 0, 'autoral', 'personalizado', 4, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'estudo', 'em_andamento', 4, 0, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  values (v_tent, v_arq_f, 1), (v_tent, v_anu_f, 2), (v_tent, v_nac_f, 3), (v_tent, v_solo, 4);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  v_res := public.get_gemeas_tentativa(v_tent);
  if v_res <> '[]'::jsonb then
    raise exception 'FALHA elegibilidade: ofereceu troca indevida. %', v_res;
  end if;

  begin
    perform public.trocar_formato_questao_tentativa(v_tent, v_nac_f);
    raise exception 'FALHA elegibilidade: trocou questão nacional';
  exception when sqlstate 'P0013' then
    null;
  end;

  begin
    perform public.trocar_formato_questao_tentativa(v_tent, v_solo);
    raise exception 'FALHA elegibilidade: trocou questão sem grupo';
  exception when sqlstate 'P0013' then
    null;
  end;

  raise notice 'OK TESTE 4 (arquivada/anulada/nacional/sem grupo não trocam).';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 5 — INTEGRIDADE PÓS-TROCA: o resultado da tentativa passa a enxergar
-- a gêmea (e o tema segue no mesmo bucket, porque a gêmea herda os temas).
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_user  uuid := '11111111-1111-1111-1111-111111111111';
  v_disc  uuid;
  v_tema  uuid;
  v_grupo uuid := gen_random_uuid();
  v_a     uuid := gen_random_uuid();
  v_b     uuid := gen_random_uuid();
  v_prova uuid;
  v_tent  uuid;
  v_res   jsonb;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.tema (nome, disciplina_id) values ('TEST_TROCA_resultado', v_disc) returning id into v_tema;

  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id,
                              resposta_modelo, pontos_chave)
  values (v_a, 'GEMEA fechada', 'multipla_escolha', 'laboratorio', 'ativa', v_disc, v_grupo, null, '[]'::jsonb),
         (v_b, 'GEMEA aberta', 'resposta_aberta_curta', 'laboratorio', 'ativa', v_disc, v_grupo,
          'modelo', '["ponto"]'::jsonb);
  insert into public.alternativa (questao_id, letra, texto, correta, ordem)
  values (v_a, 'A', 'alt A', true, 1);
  -- a gêmea herda os temas da origem (admin_criar_gemea_discursiva copia)
  insert into public.questao_tema (questao_id, tema_id) values (v_a, v_tema), (v_b, v_tema);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('TEST_TROCA', 0, 'autoral', 'personalizado', 1, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_user, v_prova, 'simulado', 'em_andamento', 1, 0, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  values (v_tent, v_a, 1);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  perform public.trocar_formato_questao_tentativa(v_tent, v_a);

  -- Sem responder: finaliza. A discursiva não enviada não gera resposta_correcao,
  -- então a tentativa consolida direto (correcoes_pendentes = 0).
  v_res := public.finalizar_tentativa(v_tent, 60);

  if jsonb_array_length(v_res->'questoes') <> 1 then
    raise exception 'FALHA resultado: esperado 1 questão, veio %', v_res->'questoes';
  end if;
  if v_res->'questoes'->0->>'id' <> v_b::text then
    raise exception 'FALHA resultado: resultado ainda aponta para a questão antiga. %', v_res->'questoes'->0->>'id';
  end if;
  if (v_res->>'correcoes_pendentes')::int <> 0 then
    raise exception 'FALHA resultado: correções pendentes inesperadas (%)', v_res->>'correcoes_pendentes';
  end if;
  if (v_res->'distribuicao_temas'->0->'tema'->>'id')::uuid <> v_tema then
    raise exception 'FALHA resultado: tema saiu do bucket. %', v_res->'distribuicao_temas';
  end if;
  if (select total_pontuaveis from public.tentativa where id = v_tent) <> 1 then
    raise exception 'FALHA resultado: denominador da nota não consolidou em 1';
  end if;

  raise notice 'OK TESTE 5 (resultado/tema/denominador seguem a gêmea).';
end $$;
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 6 — DONO: outro usuário não troca nem lê o mapa da tentativa alheia.
-- ─────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  v_dono   uuid := '11111111-1111-1111-1111-111111111111';
  v_outro  uuid := '22222222-2222-2222-2222-222222222222';
  v_disc   uuid;
  v_grupo  uuid := gen_random_uuid();
  v_a      uuid := gen_random_uuid();
  v_b      uuid := gen_random_uuid();
  v_prova  uuid;
  v_tent   uuid;
begin
  select id into v_disc from public.disciplina limit 1;
  insert into public.questao (id, enunciado, formato, tipo_questao, status, disciplina_id, grupo_equivalencia_id)
  values (v_a, 'f', 'multipla_escolha', 'laboratorio', 'ativa', v_disc, v_grupo),
         (v_b, 'a', 'resposta_aberta_curta', 'laboratorio', 'ativa', v_disc, v_grupo);

  insert into public.prova (nome, periodo, tipo, origem, qtd_questoes, publicada, arquivada)
  values ('TEST_TROCA', 0, 'autoral', 'personalizado', 1, false, false) returning id into v_prova;
  insert into public.tentativa (user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, iniciada_em, criado_em)
  values (v_dono, v_prova, 'simulado', 'em_andamento', 1, 0, 0, now(), now()) returning id into v_tent;
  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  values (v_tent, v_a, 1);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);

  begin
    perform public.get_gemeas_tentativa(v_tent);
    raise exception 'FALHA dono: usuário alheio leu o mapa';
  exception when sqlstate 'P0003' then
    null;
  end;

  begin
    perform public.trocar_formato_questao_tentativa(v_tent, v_a);
    raise exception 'FALHA dono: usuário alheio trocou a questão';
  exception when sqlstate 'P0003' then
    null;
  end;

  raise notice 'OK TESTE 6 (tentativa alheia é intocável).';
end $$;
rollback;
