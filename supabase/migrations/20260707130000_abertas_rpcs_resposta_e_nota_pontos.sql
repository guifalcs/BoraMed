-- ============================================================================
-- Questões abertas — Fase 3: RPCs de resposta/envio, nota por pontos e
-- consolidação de correções.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`
-- (ver 20260624125610 e 20260707120000).
--
-- Modelo de nota (D4/D5 do plano):
--   * Expressão canônica por resposta: coalesce(tr.pontos, (tr.correta)::int*100)
--     — MC usa `correta` (0/100), aberta usa `pontos` (0–100 da IA).
--   * `correta` fica NULL para abertas; não respondida (MC ou aberta) = 0.
--   * Falha permanente de IA (`sem_ia`) sai do denominador:
--     total_pontuaveis = total_questoes − count(sem_ia).
--   * Nível tentativa: coalesce(t.pontos, t.acertos*100) /
--     coalesce(t.total_pontuaveis, t.total_questoes) — dados antigos corretos
--     por construção, sem backfill.
-- ============================================================================

------------------------------------------------------------------------------
-- 1. tentativa — agregados por pontos (NULL em dados antigos = usar acertos)
------------------------------------------------------------------------------

alter table public.tentativa
  add column if not exists pontos numeric(7,2),
  add column if not exists total_pontuaveis integer;

comment on column public.tentativa.pontos is
  'Soma dos pontos por questão (0–100 cada). NULL = tentativa antiga (usar acertos*100) ou correções pendentes.';
comment on column public.tentativa.total_pontuaveis is
  'Denominador da nota (total_questoes − questões sem_ia). NULL = não consolidada (usar total_questoes). Dupla função: flag de consolidação.';

------------------------------------------------------------------------------
-- 2. RPC salvar_resposta_texto — rascunho de resposta aberta (sobrevive a F5)
------------------------------------------------------------------------------

create or replace function public.salvar_resposta_texto(
  p_tentativa_id uuid, p_questao_id uuid, p_texto text
)
returns public.tentativa_resposta
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid;
  v_resposta public.tentativa_resposta;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if length(coalesce(p_texto, '')) > 3000 then
    raise exception 'Resposta excede o limite de 3000 caracteres' using errcode = 'P0007';
  end if;

  if not exists (
    select 1 from public.tentativa t
    where t.id = p_tentativa_id and t.user_id = v_user_id and t.status <> 'finalizada'
  ) then
    raise exception 'Tentativa nao encontrada, finalizada ou sem permissao' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.questao q
    where q.id = p_questao_id and q.formato = 'resposta_aberta_curta'
  ) then
    raise exception 'Questao nao e discursiva' using errcode = 'P0004';
  end if;

  update public.tentativa_resposta tr
  set resposta_texto = p_texto
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = p_questao_id
    and tr.enviada_em is null
  returning * into v_resposta;

  if not found then
    if exists (
      select 1 from public.tentativa_resposta tr
      where tr.tentativa_id = p_tentativa_id and tr.questao_id = p_questao_id
    ) then
      raise exception 'Resposta ja enviada' using errcode = 'P0008';
    end if;
    raise exception 'Resposta nao encontrada para a tentativa' using errcode = 'P0005';
  end if;

  return v_resposta;
end;
$$;

revoke all on function public.salvar_resposta_texto(uuid, uuid, text) from public, anon;
grant execute on function public.salvar_resposta_texto(uuid, uuid, text) to authenticated;

------------------------------------------------------------------------------
-- 3. RPC enviar_resposta_aberta — envio definitivo (trava + correção pendente)
------------------------------------------------------------------------------

create or replace function public.enviar_resposta_aberta(
  p_tentativa_id uuid, p_questao_id uuid, p_texto text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid;
  v_resposta public.tentativa_resposta;
  v_correcao public.resposta_correcao;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if length(coalesce(p_texto, '')) > 3000 then
    raise exception 'Resposta excede o limite de 3000 caracteres' using errcode = 'P0007';
  end if;

  if not exists (
    select 1 from public.tentativa t
    where t.id = p_tentativa_id and t.user_id = v_user_id and t.status <> 'finalizada'
  ) then
    raise exception 'Tentativa nao encontrada, finalizada ou sem permissao' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.questao q
    where q.id = p_questao_id and q.formato = 'resposta_aberta_curta'
  ) then
    raise exception 'Questao nao e discursiva' using errcode = 'P0004';
  end if;

  update public.tentativa_resposta tr
  set resposta_texto = coalesce(p_texto, tr.resposta_texto),
      enviada_em = now(),
      respondida_em = now()
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = p_questao_id
    and tr.enviada_em is null
    and coalesce(coalesce(p_texto, tr.resposta_texto), '') <> ''
  returning * into v_resposta;

  if not found then
    if exists (
      select 1 from public.tentativa_resposta tr
      where tr.tentativa_id = p_tentativa_id
        and tr.questao_id = p_questao_id
        and tr.enviada_em is not null
    ) then
      raise exception 'Resposta ja enviada' using errcode = 'P0008';
    end if;
    if exists (
      select 1 from public.tentativa_resposta tr
      where tr.tentativa_id = p_tentativa_id and tr.questao_id = p_questao_id
    ) then
      raise exception 'Resposta vazia' using errcode = 'P0010';
    end if;
    raise exception 'Resposta nao encontrada para a tentativa' using errcode = 'P0005';
  end if;

  insert into public.resposta_correcao (tentativa_resposta_id)
  values (v_resposta.id)
  on conflict (tentativa_resposta_id) do nothing;

  select * into v_correcao
  from public.resposta_correcao
  where tentativa_resposta_id = v_resposta.id;

  return jsonb_build_object(
    'resposta', row_to_json(v_resposta)::jsonb,
    'correcao', row_to_json(v_correcao)::jsonb
  );
end;
$$;

revoke all on function public.enviar_resposta_aberta(uuid, uuid, text) from public, anon;
grant execute on function public.enviar_resposta_aberta(uuid, uuid, text) to authenticated;

------------------------------------------------------------------------------
-- 4. Helper interno: consolida pontos/nota da tentativa (idempotente).
--    Chamado por finalizar_tentativa e consolidar_correcoes_tentativa —
--    nunca direto por clientes. `total_pontuaveis IS NULL` é a flag de
--    "ainda não consolidada" (evita dupla atualização de stats).
------------------------------------------------------------------------------

create or replace function public.consolidar_pontos_tentativa(p_tentativa_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tentativa record;
  v_total integer;
  v_sem_ia integer;
  v_soma numeric;
begin
  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
  for update;

  if not found or v_tentativa.status <> 'finalizada' or v_tentativa.total_pontuaveis is not null then
    return; -- não finalizada ou já consolidada
  end if;

  select
    count(*),
    count(*) filter (where rc.status = 'sem_ia'),
    coalesce(sum(
      case when rc.status = 'sem_ia' then 0
           else coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100, 0)
      end
    ), 0)
  into v_total, v_sem_ia, v_soma
  from public.tentativa_resposta tr
  left join public.resposta_correcao rc on rc.tentativa_resposta_id = tr.id
  where tr.tentativa_id = p_tentativa_id;

  update public.tentativa
  set pontos = v_soma,
      total_pontuaveis = v_total - v_sem_ia,
      nota = round(v_soma / nullif(v_total - v_sem_ia, 0), 1)
  where id = p_tentativa_id;

  -- Stats das questões abertas corrigidas (D17: acerto = pontos >= 70).
  -- As de múltipla escolha são atualizadas em finalizar_tentativa; `sem_ia`
  -- fica fora das stats (também está fora da nota).
  update public.questao q
  set vezes_respondida = q.vezes_respondida + 1,
      vezes_acertada = q.vezes_acertada + case when tr.pontos >= 70 then 1 else 0 end,
      taxa_acerto = round(
        ((q.vezes_acertada + case when tr.pontos >= 70 then 1 else 0 end)::numeric
          / (q.vezes_respondida + 1)) * 100,
        2
      )
  from public.tentativa_resposta tr
  join public.resposta_correcao rc on rc.tentativa_resposta_id = tr.id
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = q.id
    and q.formato = 'resposta_aberta_curta'
    and rc.status = 'corrigida'
    and tr.respondida_em is not null;
end;
$$;

revoke all on function public.consolidar_pontos_tentativa(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 5. Helper interno: monta o ResultadoTentativa (gabarito completo — só é
--    chamado pós-finalização, mesma classe de exposição de finalizar).
------------------------------------------------------------------------------

create or replace function public.montar_resultado_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tentativa record;
  v_questoes jsonb;
  v_respostas jsonb;
  v_distribuicao jsonb;
begin
  select * into v_tentativa from public.tentativa where id = p_tentativa_id;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', q.resposta_modelo,
      'pontos_chave', coalesce(q.pontos_chave, '[]'::jsonb),
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', a.correta,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) order by a.ordem), '[]'::jsonb)
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) order by t.nome), '[]'::jsonb)
        from public.questao_tema qt
        join public.tema t on t.id = qt.tema_id
        left join public.disciplina td on td.id = t.disciplina_id
        where qt.questao_id = q.id
      )
    )
    order by coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id;

  select jsonb_agg(
    row_to_json(tr)::jsonb || jsonb_build_object(
      'correcao', (
        select row_to_json(rc)::jsonb
        from public.resposta_correcao rc
        where rc.tentativa_resposta_id = tr.id
      )
    )
    order by coalesce(tr.ordem_na_tentativa, 2147483647), tr.id
  )
  into v_respostas
  from public.tentativa_resposta tr
  where tr.tentativa_id = p_tentativa_id;

  select jsonb_agg(
    jsonb_build_object(
      'tema', jsonb_build_object(
        'id', sub.tema_id,
        'nome', sub.tema_nome,
        'disciplina_id', sub.disciplina_id,
        'disciplina', sub.disciplina_sigla,
        'periodo', sub.disciplina_periodo,
        'parent_id', sub.parent_id,
        'criado_em', sub.criado_em
      ),
      'total', sub.total,
      'acertos', sub.acertos
    )
    order by sub.tema_nome
  )
  into v_distribuicao
  from (
    select
      t.id as tema_id,
      t.nome as tema_nome,
      t.disciplina_id,
      d.sigla as disciplina_sigla,
      d.periodo::integer as disciplina_periodo,
      t.parent_id,
      t.criado_em,
      count(tr.id)::integer as total,
      -- Expressão canônica: MC acerta com correta=true (100), aberta com pontos>=70
      count(tr.id) filter (
        where coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100) >= 70
      )::integer as acertos
    from public.tentativa_resposta tr
    join public.questao_tema qt on qt.questao_id = tr.questao_id
    join public.tema t on t.id = qt.tema_id
    left join public.disciplina d on d.id = t.disciplina_id
    where tr.tentativa_id = p_tentativa_id
    group by t.id, t.nome, t.disciplina_id, d.sigla, d.periodo, t.parent_id, t.criado_em
  ) sub;

  return jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'respostas', coalesce(v_respostas, '[]'::jsonb),
    'distribuicao_temas', coalesce(v_distribuicao, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.montar_resultado_tentativa(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 6. finalizar_tentativa v2 (D9): corrige só MC, deixa nota NULL enquanto
--    houver correções de IA não resolvidas e retorna correcoes_pendentes.
------------------------------------------------------------------------------

create or replace function public.finalizar_tentativa(
  p_tentativa_id uuid, p_tempo_segundos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid;
  v_tentativa record;
  v_acertos integer;
  v_total_respondidas integer;
  v_pendentes integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status <> 'finalizada' then
    -- Gabarito objetivo: só para questões com alternativas (abertas ficam NULL;
    -- a pontuação delas vem de tentativa_resposta.pontos via IA).
    update public.tentativa_resposta tr
    set correta = (
      tr.alternativa_id is not null
      and tr.alternativa_id = (
        select a.id
        from public.alternativa a
        where a.questao_id = tr.questao_id
          and a.correta = true
        order by a.ordem
        limit 1
      )
    )
    from public.questao q
    where tr.tentativa_id = p_tentativa_id
      and q.id = tr.questao_id
      and q.formato <> 'resposta_aberta_curta';

    select
      count(*) filter (where tr.correta = true),
      count(*) filter (where tr.respondida_em is not null)
    into v_acertos, v_total_respondidas
    from public.tentativa_resposta tr
    where tr.tentativa_id = p_tentativa_id;

    -- Nota fica NULL até a consolidação (inline abaixo quando não há correções
    -- de IA pendentes — caminho de tentativa só-MC, comportamento idêntico ao anterior).
    update public.tentativa
    set status = 'finalizada',
        finalizada_em = now(),
        acertos = v_acertos,
        total_respondidas = v_total_respondidas,
        nota = null,
        pontos = null,
        total_pontuaveis = null,
        tempo_acumulado_segundos = coalesce(p_tempo_segundos, tempo_acumulado_segundos)
    where id = p_tentativa_id;

    -- Stats das questões objetivas (abertas: em consolidar_pontos_tentativa)
    update public.questao q
    set vezes_respondida = q.vezes_respondida + 1,
        vezes_acertada = q.vezes_acertada + case when tr.correta then 1 else 0 end,
        taxa_acerto = round(
          ((q.vezes_acertada + case when tr.correta then 1 else 0 end)::numeric
            / (q.vezes_respondida + 1)) * 100,
          2
        )
    from public.tentativa_resposta tr
    where tr.tentativa_id = p_tentativa_id
      and tr.questao_id = q.id
      and q.formato <> 'resposta_aberta_curta'
      and tr.respondida_em is not null;
  end if;

  select count(*) into v_pendentes
  from public.resposta_correcao rc
  join public.tentativa_resposta tr on tr.id = rc.tentativa_resposta_id
  where tr.tentativa_id = p_tentativa_id
    and rc.status in ('pendente', 'corrigindo', 'erro');

  if v_pendentes = 0 then
    perform public.consolidar_pontos_tentativa(p_tentativa_id);
  end if;

  return public.montar_resultado_tentativa(p_tentativa_id)
    || jsonb_build_object('correcoes_pendentes', v_pendentes);
end;
$$;

revoke all on function public.finalizar_tentativa(uuid, integer) from public, anon;
grant execute on function public.finalizar_tentativa(uuid, integer) to authenticated;

------------------------------------------------------------------------------
-- 7. RPC consolidar_correcoes_tentativa — fecha a nota quando as correções
--    terminam (ou força as restantes para sem_ia após o timeout da UI).
------------------------------------------------------------------------------

create or replace function public.consolidar_correcoes_tentativa(
  p_tentativa_id uuid, p_forcar_sem_ia boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid;
  v_tentativa record;
  v_pendentes integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status <> 'finalizada' then
    raise exception 'Tentativa nao finalizada' using errcode = 'P0006';
  end if;

  if p_forcar_sem_ia then
    update public.resposta_correcao rc
    set status = 'sem_ia',
        atualizado_em = now()
    from public.tentativa_resposta tr
    where tr.id = rc.tentativa_resposta_id
      and tr.tentativa_id = p_tentativa_id
      and rc.status in ('pendente', 'corrigindo', 'erro');
  end if;

  select count(*) into v_pendentes
  from public.resposta_correcao rc
  join public.tentativa_resposta tr on tr.id = rc.tentativa_resposta_id
  where tr.tentativa_id = p_tentativa_id
    and rc.status in ('pendente', 'corrigindo', 'erro');

  if v_pendentes > 0 then
    return jsonb_build_object('consolidada', false, 'correcoes_pendentes', v_pendentes);
  end if;

  perform public.consolidar_pontos_tentativa(p_tentativa_id);

  return public.montar_resultado_tentativa(p_tentativa_id)
    || jsonb_build_object('consolidada', true, 'correcoes_pendentes', 0);
end;
$$;

revoke all on function public.consolidar_correcoes_tentativa(uuid, boolean) from public, anon;
grant execute on function public.consolidar_correcoes_tentativa(uuid, boolean) to authenticated;

------------------------------------------------------------------------------
-- 8. RPC get_status_correcoes — polling da tela de resultado bloqueante
------------------------------------------------------------------------------

create or replace function public.get_status_correcoes(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.tentativa t
    where t.id = p_tentativa_id and t.user_id = v_user_id
  ) then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'corrigidas', count(*) filter (where rc.status = 'corrigida'),
    'pendentes', count(*) filter (where rc.status in ('pendente', 'corrigindo')),
    'erros', count(*) filter (where rc.status = 'erro'),
    'sem_ia', count(*) filter (where rc.status = 'sem_ia'),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'tentativa_resposta_id', rc.tentativa_resposta_id,
      'status', rc.status
    )), '[]'::jsonb)
  )
  into v_result
  from public.resposta_correcao rc
  join public.tentativa_resposta tr on tr.id = rc.tentativa_resposta_id
  where tr.tentativa_id = p_tentativa_id;

  return v_result;
end;
$$;

revoke all on function public.get_status_correcoes(uuid) from public, anon;
grant execute on function public.get_status_correcoes(uuid) to authenticated;

------------------------------------------------------------------------------
-- 9. iniciar/retomar_tentativa — emitem o gabarito aberto (resposta_modelo,
--    pontos_chave, criterios_correcao) mascarado em modo simulado (D10),
--    espelhando o mecanismo de alternativa.correta.
------------------------------------------------------------------------------

create or replace function public.iniciar_tentativa(p_prova_id uuid, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id uuid;
  v_prova record;
  v_tentativa record;
  v_questoes jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo', 'visualizar') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  SELECT p.*, count(pq.questao_id) FILTER (WHERE q.status = 'ativa') AS total
  INTO v_prova
  FROM public.prova p
  LEFT JOIN public.prova_questao pq ON pq.prova_id = p.id
  LEFT JOIN public.questao q ON q.id = pq.questao_id
  WHERE p.id = p_prova_id
  GROUP BY p.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova nao encontrada' USING ERRCODE = 'P0003';
  END IF;

  IF v_prova.total = 0 THEN
    RAISE EXCEPTION 'A prova nao possui questoes ativas' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, q.id, row_number() OVER (ORDER BY pq.ordem, q.id)::integer
  FROM public.prova_questao pq
  JOIN public.questao q ON q.id = pq.questao_id
  WHERE pq.prova_id = p_prova_id
    AND q.status = 'ativa'
  ORDER BY pq.ordem, q.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', p_prova_id,
      'ordem_na_prova', tr.ordem_na_tentativa,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN p_modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY tr.ordem_na_tentativa
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = v_tentativa.id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$$;

create or replace function public.retomar_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id uuid;
  v_tentativa record;
  v_questoes jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa nao encontrada ou sem permissao' USING ERRCODE = 'P0003';
  END IF;

  IF v_tentativa.status = 'finalizada' THEN
    RAISE EXCEPTION 'Tentativa ja finalizada' USING ERRCODE = 'P0005';
  END IF;

  UPDATE public.tentativa
  SET status = 'em_andamento',
      pausada_em = NULL
  WHERE id = p_tentativa_id
  RETURNING * INTO v_tentativa;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN v_tentativa.modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = p_tentativa_id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$$;
