create or replace function public.get_ranking_global(p_limite integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite integer;
begin
  v_limite := least(greatest(coalesce(p_limite, 10), 1), 50);

  return (
    with ranking as (
      select
        s.user_id,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
          else 'Anônimo'
        end as nome_display,
        s.nivel,
        s.xp_total,
        s.xp_semana_atual,
        row_number() over (order by s.xp_total desc, s.atualizado_em asc, s.user_id asc) as posicao
      from public.user_gamificacao_stats s
      left join public.profiles p on p.id = s.user_id
      where s.xp_total > 0
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'nome_display', nome_display,
          'nivel', nivel,
          'xp_total', xp_total,
          'xp_semana_atual', xp_semana_atual,
          'posicao', posicao
        )
        order by posicao
      ),
      '[]'::jsonb
    )
    from ranking
    where posicao <= v_limite
  );
end;
$function$;

create or replace function public.get_ranking_semana(p_limite integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite integer;
begin
  v_limite := least(greatest(coalesce(p_limite, 10), 1), 50);

  return (
    with ranking as (
      select
        s.user_id,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
          else 'Anônimo'
        end as nome_display,
        s.nivel,
        s.xp_total,
        s.xp_semana_atual,
        row_number() over (order by s.xp_semana_atual desc, s.atualizado_em asc, s.user_id asc) as posicao
      from public.user_gamificacao_stats s
      left join public.profiles p on p.id = s.user_id
      where s.xp_semana_atual > 0
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'nome_display', nome_display,
          'nivel', nivel,
          'xp_total', xp_total,
          'xp_semana_atual', xp_semana_atual,
          'posicao', posicao
        )
        order by posicao
      ),
      '[]'::jsonb
    )
    from ranking
    where posicao <= v_limite
  );
end;
$function$;

create or replace function public.get_minha_posicao_ranking()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  return (
    with global_rank as (
      select
        user_id,
        row_number() over (order by xp_total desc, atualizado_em asc, user_id asc) as posicao
      from public.user_gamificacao_stats
      where xp_total > 0
    ),
    semana_rank as (
      select
        user_id,
        row_number() over (order by xp_semana_atual desc, atualizado_em asc, user_id asc) as posicao
      from public.user_gamificacao_stats
      where xp_semana_atual > 0
    ),
    totais as (
      select
        count(*) filter (where xp_total > 0)::integer as total_global,
        count(*) filter (where xp_semana_atual > 0)::integer as total_semana
      from public.user_gamificacao_stats
    )
    select jsonb_build_object(
      'posicao_global', (select posicao from global_rank where user_id = v_user_id),
      'posicao_semana', (select posicao from semana_rank where user_id = v_user_id),
      'total_global', total_global,
      'total_semana', total_semana
    )
    from totais
  );
end;
$function$;

revoke execute on function public.get_ranking_global(integer) from public;
revoke execute on function public.get_ranking_semana(integer) from public;
revoke execute on function public.get_minha_posicao_ranking() from public;

grant execute on function public.get_ranking_global(integer) to authenticated;
grant execute on function public.get_ranking_semana(integer) to authenticated;
grant execute on function public.get_minha_posicao_ranking() to authenticated;
