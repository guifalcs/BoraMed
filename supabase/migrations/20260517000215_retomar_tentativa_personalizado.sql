-- Corrige a retomada de simulados personalizados e o retorno do streak v2.
-- Simulados personalizados devem ser reconstruídos a partir de tentativa_resposta,
-- pois suas questões não pertencem necessariamente à prova sintética criada.

alter table public.tentativa_resposta
add column if not exists ordem_na_tentativa integer;

create index if not exists idx_tentativa_resposta_tentativa_ordem
on public.tentativa_resposta (tentativa_id, ordem_na_tentativa);

with numeradas as (
  select
    id,
    row_number() over (
      partition by tentativa_id
      order by id
    ) as ordem
  from public.tentativa_resposta
  where ordem_na_tentativa is null
)
update public.tentativa_resposta tr
set ordem_na_tentativa = numeradas.ordem
from numeradas
where tr.id = numeradas.id;

create or replace function public.gerar_simulado_personalizado(
  p_tema_ids uuid[] default null::uuid[],
  p_qtd integer default 10,
  p_modo text default 'simulado'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id       uuid;
  v_prova_id      uuid;
  v_tentativa     record;
  v_questoes      jsonb;
  v_total         int;
  v_nome          text;
  v_selected_ids  uuid[];
  v_edicao        int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if p_modo not in ('simulado', 'estudo') then
    raise exception 'Modo inválido: %', p_modo using errcode = 'P0002';
  end if;

  if p_qtd < 1 or p_qtd > 50 then
    raise exception 'Quantidade deve ser entre 1 e 50' using errcode = 'P0006';
  end if;

  select array(
    select q.id
    from public.questao q
    where q.status = 'ativa'
      and (
        p_tema_ids is null
        or array_length(p_tema_ids, 1) is null
        or exists (
          select 1
          from public.questao_tema qt
          where qt.questao_id = q.id
            and qt.tema_id = any(p_tema_ids)
        )
      )
    order by random()
    limit p_qtd
  ) into v_selected_ids;

  v_total := array_length(v_selected_ids, 1);

  if v_total is null or v_total = 0 then
    raise exception 'Nenhuma questão encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' using errcode = 'P0004';
  end if;

  if p_tema_ids is null or array_length(p_tema_ids, 1) is null then
    v_nome := 'Simulado personalizado — ' || v_total || ' questões';
  else
    select 'Simulado — ' || string_agg(t.nome, ', ' order by t.nome) || ' — ' || v_total || 'q'
    into v_nome
    from public.tema t
    where t.id = any(p_tema_ids);
  end if;

  if length(v_nome) > 200 then
    v_nome := left(v_nome, 197) || '...';
  end if;

  v_edicao := -(extract(epoch from clock_timestamp())::int % 2000000000);

  insert into public.prova (faculdade_id, nome, periodo, tipo, qtd_questoes, edicao)
  values (null, v_nome, 0, 'processual', v_total, v_edicao)
  returning id into v_prova_id;

  insert into public.tentativa (
    user_id, prova_id, modo, status,
    total_questoes, total_respondidas, acertos,
    iniciada_em, criado_em
  )
  values (
    v_user_id, v_prova_id, p_modo, 'em_andamento',
    v_total, 0, 0,
    now(), now()
  )
  returning * into v_tentativa;

  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  select v_tentativa.id, selected.questao_id, selected.ordem::integer
  from unnest(v_selected_ids) with ordinality as selected(questao_id, ordem);

  select jsonb_agg(
    jsonb_build_object(
      'id',                      q.id,
      'prova_id',                q.prova_id,
      'ordem_na_prova',          q.ordem_na_prova,
      'codigo_externo',          q.codigo_externo,
      'enunciado_apoio',         q.enunciado_apoio,
      'enunciado',               q.enunciado,
      'imagem_url',              q.imagem_url,
      'imagem_legenda',          q.imagem_legenda,
      'formato',                 q.formato,
      'explicacao',              q.explicacao,
      'dificuldade',             q.dificuldade,
      'disciplina',              dq.sigla,
      'periodo',                 dq.periodo::int,
      'status',                  q.status,
      'criado_em',               q.criado_em,
      'atualizado_em',           q.atualizado_em,
      'alternativas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         a.id,
            'questao_id', a.questao_id,
            'letra',      a.letra,
            'texto',      a.texto,
            'correta',    case when p_modo = 'simulado' then null else a.correta end,
            'ordem',      a.ordem,
            'imagem_url', a.imagem_url
          ) order by a.ordem
        )
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         t.id,
            'nome',       t.nome,
            'disciplina', dt.sigla,
            'periodo',    dt.periodo::int,
            'parent_id',  t.parent_id,
            'criado_em',  t.criado_em
          )
        )
        from public.questao_tema qt2
        join public.tema t on t.id = qt2.tema_id
        left join public.disciplina dt on dt.id = t.disciplina_id
        where qt2.questao_id = q.id
      )
    )
    order by array_position(v_selected_ids, q.id)
  )
  into v_questoes
  from public.questao q
  left join public.disciplina dq on dq.id = q.disciplina_id
  where q.id = any(v_selected_ids);

  return jsonb_build_object(
    'prova_id',   v_prova_id,
    'tentativa',  row_to_json(v_tentativa)::jsonb,
    'questoes',   coalesce(v_questoes, '[]'::jsonb)
  );
end;
$function$;

create or replace function public.retomar_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id   uuid;
  v_tentativa record;
  v_questoes  jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa não encontrada ou sem permissão' using errcode = 'P0003';
  end if;

  if v_tentativa.status = 'finalizada' then
    raise exception 'Tentativa já finalizada' using errcode = 'P0005';
  end if;

  update public.tentativa
  set status = 'em_andamento',
      pausada_em = null
  where id = p_tentativa_id
  returning * into v_tentativa;

  select jsonb_agg(
    jsonb_build_object(
      'id',                      q.id,
      'prova_id',                q.prova_id,
      'ordem_na_prova',          q.ordem_na_prova,
      'codigo_externo',          q.codigo_externo,
      'enunciado_apoio',         q.enunciado_apoio,
      'enunciado',               q.enunciado,
      'imagem_url',              q.imagem_url,
      'imagem_legenda',          q.imagem_legenda,
      'formato',                 q.formato,
      'explicacao',              q.explicacao,
      'dificuldade',             q.dificuldade,
      'disciplina',              dq.sigla,
      'periodo',                 dq.periodo::int,
      'status',                  q.status,
      'criado_em',               q.criado_em,
      'atualizado_em',           q.atualizado_em,
      'alternativas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         a.id,
            'questao_id', a.questao_id,
            'letra',      a.letra,
            'texto',      a.texto,
            'correta',    case when v_tentativa.modo = 'simulado' then null else a.correta end,
            'ordem',      a.ordem,
            'imagem_url', a.imagem_url
          ) order by a.ordem
        )
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         t.id,
            'nome',       t.nome,
            'disciplina', dt.sigla,
            'periodo',    dt.periodo::int,
            'parent_id',  t.parent_id,
            'criado_em',  t.criado_em
          )
        )
        from public.questao_tema qt
        join public.tema t on t.id = qt.tema_id
        left join public.disciplina dt on dt.id = t.disciplina_id
        where qt.questao_id = q.id
      )
    )
    order by
      coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647),
      tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina dq on dq.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id
    and q.status = 'ativa';

  return jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes',  coalesce(v_questoes, '[]'::jsonb)
  );
end;
$function$;

revoke execute on function public.retomar_tentativa(uuid) from public;
revoke execute on function public.retomar_tentativa(uuid) from anon;
grant execute on function public.retomar_tentativa(uuid) to authenticated;

create or replace function public.get_streak_estudo_v2()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_stats public.user_gamificacao_stats%rowtype;
  v_hoje date;
  v_semana_iso text;
  v_streak_atual integer;
  v_freeze_usado_hoje boolean;
  v_dias_para_proximo_marco integer;
  v_marcos integer[] := array[3, 7, 14, 30, 100, 365];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
  v_semana_iso := to_char(v_hoje, 'IYYY-"W"IW');

  insert into public.user_gamificacao_stats (
    user_id,
    xp_total,
    xp_semana_atual,
    semana_iso,
    nivel,
    streak_atual,
    streak_recorde,
    freezes_disponiveis,
    competir_publico,
    atualizado_em
  )
  values (
    v_user_id,
    0,
    0,
    v_semana_iso,
    0,
    0,
    0,
    0,
    true,
    now()
  )
  on conflict (user_id) do update
  set
    xp_semana_atual = case
      when public.user_gamificacao_stats.semana_iso = v_semana_iso
        then public.user_gamificacao_stats.xp_semana_atual
      else 0
    end,
    semana_iso = v_semana_iso,
    atualizado_em = now()
  returning * into v_stats;

  v_streak_atual := case
    when v_stats.ultimo_dia_ativo is null then 0
    when v_stats.ultimo_dia_ativo >= v_hoje - 1 then coalesce(v_stats.streak_atual, 0)
    else 0
  end;

  select coalesce(min(marco - v_streak_atual), 0)
  into v_dias_para_proximo_marco
  from unnest(v_marcos) as marco
  where marco > v_streak_atual;

  v_freeze_usado_hoje := coalesce(v_stats.freeze_usado_em = v_hoje, false);

  return jsonb_build_object(
    'atual', v_streak_atual,
    'recorde', coalesce(v_stats.streak_recorde, 0),
    'freezes_disponiveis', coalesce(v_stats.freezes_disponiveis, 0),
    'freeze_usado_hoje', v_freeze_usado_hoje,
    'dias_para_proximo_marco', coalesce(v_dias_para_proximo_marco, 0)
  );
end;
$function$;

revoke execute on function public.get_streak_estudo_v2() from public;
revoke execute on function public.get_streak_estudo_v2() from anon;
grant execute on function public.get_streak_estudo_v2() to authenticated;
