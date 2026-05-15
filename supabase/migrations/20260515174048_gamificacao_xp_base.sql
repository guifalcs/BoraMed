create table "public"."gamificacao_evento" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "tipo" text not null,
  "xp" integer not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "idempotency_key" text not null,
  "criado_em" timestamp with time zone not null default now(),
  constraint "gamificacao_evento_pkey" primary key ("id"),
  constraint "gamificacao_evento_user_id_fkey" foreign key ("user_id") references auth.users("id") on delete cascade,
  constraint "gamificacao_evento_tipo_check" check ("tipo" in ('tentativa', 'desafio_diario', 'streak_marco', 'conquista')),
  constraint "gamificacao_evento_xp_check" check ("xp" >= 0),
  constraint "gamificacao_evento_user_id_idempotency_key_key" unique ("user_id", "idempotency_key")
);

create table "public"."user_gamificacao_stats" (
  "user_id" uuid not null,
  "xp_total" bigint not null default 0,
  "xp_semana_atual" integer not null default 0,
  "semana_iso" text,
  "nivel" smallint not null default 0,
  "streak_atual" smallint not null default 0,
  "streak_recorde" smallint not null default 0,
  "ultimo_dia_ativo" date,
  "freezes_disponiveis" smallint not null default 0,
  "freeze_usado_em" date,
  "competir_publico" boolean not null default true,
  "atualizado_em" timestamp with time zone not null default now(),
  constraint "user_gamificacao_stats_pkey" primary key ("user_id"),
  constraint "user_gamificacao_stats_user_id_fkey" foreign key ("user_id") references auth.users("id") on delete cascade,
  constraint "user_gamificacao_stats_xp_total_check" check ("xp_total" >= 0),
  constraint "user_gamificacao_stats_xp_semana_atual_check" check ("xp_semana_atual" >= 0),
  constraint "user_gamificacao_stats_nivel_check" check ("nivel" >= 0),
  constraint "user_gamificacao_stats_streak_atual_check" check ("streak_atual" >= 0),
  constraint "user_gamificacao_stats_streak_recorde_check" check ("streak_recorde" >= 0),
  constraint "user_gamificacao_stats_freezes_disponiveis_check" check ("freezes_disponiveis" between 0 and 2)
);

create index "idx_gamificacao_evento_user_created"
  on "public"."gamificacao_evento" using btree ("user_id", "criado_em" desc);

create index "idx_gamificacao_evento_tipo_created"
  on "public"."gamificacao_evento" using btree ("tipo", "criado_em" desc);

alter table "public"."gamificacao_evento" enable row level security;
alter table "public"."user_gamificacao_stats" enable row level security;

create policy "gamificacao_evento_select_own"
  on "public"."gamificacao_evento"
  as permissive
  for select
  to authenticated
  using (((select auth.uid()) = user_id));

create policy "user_gamificacao_stats_select_own"
  on "public"."user_gamificacao_stats"
  as permissive
  for select
  to authenticated
  using (((select auth.uid()) = user_id));

revoke all on table "public"."gamificacao_evento" from anon;
revoke all on table "public"."user_gamificacao_stats" from anon;

grant select on table "public"."gamificacao_evento" to authenticated;
grant select on table "public"."user_gamificacao_stats" to authenticated;

create or replace function public.atualizar_user_gamificacao_stats()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_semana_iso text;
begin
  v_semana_iso := to_char((new.criado_em at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW');

  insert into public.user_gamificacao_stats (
    user_id,
    xp_total,
    xp_semana_atual,
    semana_iso,
    nivel,
    ultimo_dia_ativo,
    atualizado_em
  )
  values (
    new.user_id,
    new.xp,
    new.xp,
    v_semana_iso,
    floor(sqrt(new.xp::numeric / 100))::smallint,
    (new.criado_em at time zone 'America/Sao_Paulo')::date,
    now()
  )
  on conflict (user_id) do update
  set
    xp_total = user_gamificacao_stats.xp_total + excluded.xp_total,
    xp_semana_atual = case
      when user_gamificacao_stats.semana_iso = excluded.semana_iso
        then user_gamificacao_stats.xp_semana_atual + excluded.xp_semana_atual
      else excluded.xp_semana_atual
    end,
    semana_iso = excluded.semana_iso,
    nivel = floor(sqrt((user_gamificacao_stats.xp_total + excluded.xp_total)::numeric / 100))::smallint,
    ultimo_dia_ativo = greatest(
      coalesce(user_gamificacao_stats.ultimo_dia_ativo, excluded.ultimo_dia_ativo),
      excluded.ultimo_dia_ativo
    ),
    atualizado_em = now();

  return new;
end;
$function$;

create trigger "trg_gamificacao_evento_after_insert"
after insert on "public"."gamificacao_evento"
for each row execute function public.atualizar_user_gamificacao_stats();

create or replace function public.get_meu_xp()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_stats public.user_gamificacao_stats%rowtype;
  v_semana_iso text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  v_semana_iso := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW');

  insert into public.user_gamificacao_stats (user_id, semana_iso, atualizado_em)
  values (v_user_id, v_semana_iso, now())
  on conflict (user_id) do update
  set
    xp_semana_atual = case
      when user_gamificacao_stats.semana_iso = v_semana_iso then user_gamificacao_stats.xp_semana_atual
      else 0
    end,
    semana_iso = v_semana_iso,
    atualizado_em = now()
  returning * into v_stats;

  return jsonb_build_object(
    'xp_total', v_stats.xp_total,
    'xp_semana_atual', v_stats.xp_semana_atual,
    'semana_iso', v_stats.semana_iso,
    'nivel', v_stats.nivel,
    'streak_atual', v_stats.streak_atual,
    'streak_recorde', v_stats.streak_recorde,
    'freezes_disponiveis', v_stats.freezes_disponiveis,
    'competir_publico', v_stats.competir_publico
  );
end;
$function$;

create or replace function public.conceder_xp_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_tentativa public.tentativa%rowtype;
  v_idempotency_key text;
  v_evento_existente uuid;
  v_base integer;
  v_bonus_nota integer;
  v_bonus_dificuldade integer;
  v_bonus_tempo integer;
  v_xp_calculado integer;
  v_xp_hoje integer;
  v_xp_concedido integer;
  v_tempo_medio numeric;
  v_stats jsonb;
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

  v_idempotency_key := 'tentativa:' || p_tentativa_id::text;

  select id into v_evento_existente
  from public.gamificacao_evento
  where user_id = v_user_id
    and idempotency_key = v_idempotency_key;

  if found then
    return jsonb_build_object(
      'xp_ganho', 0,
      'ja_concedido', true,
      'novas_conquistas', '[]'::jsonb,
      'stats', public.get_meu_xp()
    );
  end if;

  if v_tentativa.status <> 'finalizada' or v_tentativa.modo = 'visualizar' then
    return jsonb_build_object(
      'xp_ganho', 0,
      'ja_concedido', false,
      'novas_conquistas', '[]'::jsonb,
      'stats', public.get_meu_xp()
    );
  end if;

  v_base := greatest(coalesce(v_tentativa.acertos, 0), 0) * 10;
  v_bonus_nota := case
    when coalesce(v_tentativa.nota, 0) >= 70 then 50
    when coalesce(v_tentativa.nota, 0) >= 50 then 20
    else 0
  end;

  select coalesce(sum(coalesce(q.dificuldade, 0) * 2), 0)::integer
  into v_bonus_dificuldade
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  where tr.tentativa_id = p_tentativa_id
    and tr.correta = true;

  v_tempo_medio := case
    when coalesce(v_tentativa.total_respondidas, 0) > 0
      then v_tentativa.tempo_acumulado_segundos::numeric / v_tentativa.total_respondidas
    else null
  end;

  v_bonus_tempo := case
    when v_tempo_medio is not null
      and v_tempo_medio < 60
      and coalesce(v_tentativa.nota, 0) >= 50
      then 15
    else 0
  end;

  v_xp_calculado := v_base + v_bonus_nota + v_bonus_dificuldade + v_bonus_tempo;

  select coalesce(sum(xp), 0)::integer
  into v_xp_hoje
  from public.gamificacao_evento
  where user_id = v_user_id
    and tipo = 'tentativa'
    and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;

  v_xp_concedido := least(v_xp_calculado, greatest(500 - v_xp_hoje, 0));

  insert into public.gamificacao_evento (
    user_id,
    tipo,
    xp,
    metadata,
    idempotency_key
  )
  values (
    v_user_id,
    'tentativa',
    v_xp_concedido,
    jsonb_build_object(
      'tentativa_id', p_tentativa_id,
      'xp_calculado', v_xp_calculado,
      'xp_cap_diario_restante_antes', greatest(500 - v_xp_hoje, 0),
      'base', v_base,
      'bonus_nota', v_bonus_nota,
      'bonus_dificuldade', v_bonus_dificuldade,
      'bonus_tempo', v_bonus_tempo,
      'tempo_medio_resposta_segundos', v_tempo_medio
    ),
    v_idempotency_key
  );

  v_stats := public.get_meu_xp();

  return jsonb_build_object(
    'xp_ganho', v_xp_concedido,
    'ja_concedido', false,
    'novas_conquistas', '[]'::jsonb,
    'stats', v_stats
  );
end;
$function$;

revoke execute on function public.atualizar_user_gamificacao_stats() from public;
revoke execute on function public.get_meu_xp() from public;
revoke execute on function public.conceder_xp_tentativa(uuid) from public;

grant execute on function public.get_meu_xp() to authenticated;
grant execute on function public.conceder_xp_tentativa(uuid) to authenticated;
