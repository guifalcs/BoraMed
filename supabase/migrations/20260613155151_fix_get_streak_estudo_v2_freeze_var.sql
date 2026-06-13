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
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
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
