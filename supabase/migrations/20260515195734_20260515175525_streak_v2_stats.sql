create or replace function public.atualizar_user_gamificacao_stats()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_semana_iso text;
  v_dia_ativo date;
  v_prev public.user_gamificacao_stats%rowtype;
  v_gap integer;
  v_streak_atual smallint;
  v_streak_recorde smallint;
  v_freezes_disponiveis smallint;
  v_freeze_usado_em date;
begin
  v_dia_ativo := (new.criado_em at time zone 'America/Sao_Paulo')::date;
  v_semana_iso := to_char(v_dia_ativo, 'IYYY-"W"IW');

  select * into v_prev
  from public.user_gamificacao_stats
  where user_id = new.user_id
  for update;

  if not found then
    v_streak_atual := case when new.tipo in ('tentativa', 'desafio_diario') then 1 else 0 end;
    v_streak_recorde := v_streak_atual;
    v_freezes_disponiveis := 0;
    v_freeze_usado_em := null;
  else
    v_streak_atual := v_prev.streak_atual;
    v_streak_recorde := v_prev.streak_recorde;
    v_freezes_disponiveis := v_prev.freezes_disponiveis;
    v_freeze_usado_em := v_prev.freeze_usado_em;

    if new.tipo in ('tentativa', 'desafio_diario') then
      if v_prev.ultimo_dia_ativo is null then
        v_streak_atual := 1;
      elsif v_dia_ativo <= v_prev.ultimo_dia_ativo then
        v_streak_atual := v_prev.streak_atual;
      else
        v_gap := v_dia_ativo - v_prev.ultimo_dia_ativo;
        if v_gap = 1 then
          v_streak_atual := v_prev.streak_atual + 1;
        elsif v_gap = 2 and v_prev.freezes_disponiveis > 0 then
          v_streak_atual := v_prev.streak_atual + 1;
          v_freezes_disponiveis := v_prev.freezes_disponiveis - 1;
          v_freeze_usado_em := v_prev.ultimo_dia_ativo + 1;
        else
          v_streak_atual := 1;
        end if;

        if v_streak_atual > v_prev.streak_atual and v_streak_atual % 7 = 0 then
          v_freezes_disponiveis := least(v_freezes_disponiveis + 1, 2);
        end if;
      end if;
    end if;

    v_streak_recorde := greatest(v_streak_recorde, v_streak_atual);
  end if;

  insert into public.user_gamificacao_stats (
    user_id, xp_total, xp_semana_atual, semana_iso, nivel,
    streak_atual, streak_recorde, ultimo_dia_ativo,
    freezes_disponiveis, freeze_usado_em, atualizado_em
  )
  values (
    new.user_id, new.xp, new.xp, v_semana_iso,
    floor(sqrt(new.xp::numeric / 100))::smallint,
    v_streak_atual, v_streak_recorde,
    case when new.tipo in ('tentativa', 'desafio_diario') then v_dia_ativo else null end,
    v_freezes_disponiveis, v_freeze_usado_em, now()
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
    streak_atual = excluded.streak_atual,
    streak_recorde = excluded.streak_recorde,
    ultimo_dia_ativo = case
      when new.tipo in ('tentativa', 'desafio_diario') then greatest(
        coalesce(user_gamificacao_stats.ultimo_dia_ativo, excluded.ultimo_dia_ativo),
        excluded.ultimo_dia_ativo
      )
      else user_gamificacao_stats.ultimo_dia_ativo
    end,
    freezes_disponiveis = excluded.freezes_disponiveis,
    freeze_usado_em = excluded.freeze_usado_em,
    atualizado_em = now();

  return new;
end;
$function$;

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

  insert into public.user_gamificacao_stats (user_id, semana_iso, atualizado_em)
  values (v_user_id, to_char(v_hoje, 'IYYY-"W"IW'), now())
  on conflict (user_id) do update set atualizado_em = now()
  returning * into v_stats;

  v_streak_atual := case
    when v_stats.ultimo_dia_ativo is null then 0
    when v_stats.ultimo_dia_ativo >= v_hoje - 1 then v_stats.streak_atual
    else 0
  end;

  select coalesce(min(marco - v_streak_atual), 0)
  into v_dias_para_proximo_marco
  from unnest(v_marcos) as marco
  where marco > v_streak_atual;

  v_freeze_usado_hoje := v_stats.freeze_usado_em = v_hoje;

  return jsonb_build_object(
    'atual', v_streak_atual,
    'recorde', v_stats.streak_recorde,
    'freezes_disponiveis', v_stats.freezes_disponiveis,
    'freeze_usado_hoje', v_freeze_uso_hoje,
    'dias_para_proximo_marco', v_dias_para_proximo_marco
  );
end;
$function$;

insert into public.user_gamificacao_stats (
  user_id, semana_iso, streak_atual, streak_recorde,
  ultimo_dia_ativo, freezes_disponiveis, atualizado_em
)
select
  user_id,
  to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW'),
  coalesce(current_streak, 0)::smallint,
  coalesce(record_streak, 0)::smallint,
  ultimo_dia_ativo,
  least(coalesce(record_streak, 0) / 7, 2)::smallint,
  now()
from (
  with dias as (
    select distinct
      user_id,
      (finalizada_em at time zone 'America/Sao_Paulo')::date as dia
    from public.tentativa
    where status = 'finalizada' and modo <> 'visualizar' and finalizada_em is not null
  ),
  numerados as (
    select user_id, dia,
      dia - (row_number() over (partition by user_id order by dia))::int as grp
    from dias
  ),
  sequencias as (
    select user_id, min(dia) as inicio, max(dia) as fim, count(*)::int as dias
    from numerados group by user_id, grp
  )
  select
    d.user_id,
    max(d.dia) as ultimo_dia_ativo,
    max(s.dias) as record_streak,
    coalesce(max(s.dias) filter (
      where s.fim >= (now() at time zone 'America/Sao_Paulo')::date - 1
    ), 0) as current_streak
  from dias d
  left join sequencias s on s.user_id = d.user_id
  group by d.user_id
) sub
on conflict (user_id) do update
set
  streak_atual = greatest(user_gamificacao_stats.streak_atual, excluded.streak_atual),
  streak_recorde = greatest(user_gamificacao_stats.streak_recorde, excluded.streak_recorde),
  ultimo_dia_ativo = greatest(
    coalesce(user_gamificacao_stats.ultimo_dia_ativo, excluded.ultimo_dia_ativo),
    excluded.ultimo_dia_ativo
  ),
  freezes_disponiveis = greatest(user_gamificacao_stats.freezes_disponiveis, excluded.freezes_disponiveis),
  atualizado_em = now();

revoke execute on function public.get_streak_estudo_v2() from public;
grant execute on function public.get_streak_estudo_v2() to authenticated;;
