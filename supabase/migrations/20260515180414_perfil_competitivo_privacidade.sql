alter table "public"."profiles"
add column if not exists "competir_publico" boolean not null default true;

create or replace function public.sync_profile_competir_publico()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.user_gamificacao_stats (
    user_id,
    semana_iso,
    competir_publico,
    atualizado_em
  )
  values (
    new.id,
    to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW'),
    new.competir_publico,
    now()
  )
  on conflict (user_id) do update
  set
    competir_publico = excluded.competir_publico,
    atualizado_em = now();

  return new;
end;
$function$;

drop trigger if exists on_profiles_competir_publico_updated on public.profiles;

create trigger on_profiles_competir_publico_updated
after insert or update of competir_publico on public.profiles
for each row execute function public.sync_profile_competir_publico();

insert into public.user_gamificacao_stats (
  user_id,
  semana_iso,
  competir_publico,
  atualizado_em
)
select
  id,
  to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW'),
  competir_publico,
  now()
from public.profiles
on conflict (user_id) do update
set
  competir_publico = excluded.competir_publico,
  atualizado_em = now();

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
  v_competir_publico boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  v_semana_iso := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW');

  select coalesce(p.competir_publico, true)
  into v_competir_publico
  from public.profiles p
  where p.id = v_user_id;

  insert into public.user_gamificacao_stats (user_id, semana_iso, competir_publico, atualizado_em)
  values (v_user_id, v_semana_iso, coalesce(v_competir_publico, true), now())
  on conflict (user_id) do update
  set
    xp_semana_atual = case
      when user_gamificacao_stats.semana_iso = v_semana_iso then user_gamificacao_stats.xp_semana_atual
      else 0
    end,
    semana_iso = v_semana_iso,
    competir_publico = coalesce(v_competir_publico, user_gamificacao_stats.competir_publico),
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

revoke execute on function public.sync_profile_competir_publico() from public;
revoke execute on function public.get_meu_xp() from public;
grant execute on function public.get_meu_xp() to authenticated;
