create or replace function public.get_ranking_global(p_limite integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite  integer;
  v_user_id uuid;
begin
  v_limite  := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_user_id := auth.uid();

  return (
    with ranking as (
      select
        s.user_id,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
          else 'Anônimo'
        end as nome_display,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then p.avatar_url
          else null
        end as avatar_url,
        s.nivel,
        s.xp_total,
        s.xp_semana_atual,
        row_number() over (order by s.xp_total desc, s.atualizado_em asc, s.user_id asc) as posicao,
        (s.user_id = v_user_id) as is_me
      from public.user_gamificacao_stats s
      left join public.profiles p on p.id = s.user_id
      where s.xp_total > 0
    ),
    top_n as (
      select * from ranking where posicao <= v_limite
    ),
    eu_fora as (
      select * from ranking
      where v_user_id is not null
        and user_id = v_user_id
        and posicao > v_limite
    ),
    combinado as (
      select * from top_n
      union all
      select * from eu_fora
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id',        user_id,
          'nome_display',   nome_display,
          'avatar_url',     avatar_url,
          'nivel',          nivel,
          'xp_total',       xp_total,
          'xp_semana_atual', xp_semana_atual,
          'posicao',        posicao,
          'is_me',          is_me
        )
        order by posicao
      ),
      '[]'::jsonb
    )
    from combinado
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
  v_limite  integer;
  v_user_id uuid;
begin
  v_limite  := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_user_id := auth.uid();

  return (
    with ranking as (
      select
        s.user_id,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
          else 'Anônimo'
        end as nome_display,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then p.avatar_url
          else null
        end as avatar_url,
        s.nivel,
        s.xp_total,
        s.xp_semana_atual,
        row_number() over (order by s.xp_semana_atual desc, s.atualizado_em asc, s.user_id asc) as posicao,
        (s.user_id = v_user_id) as is_me
      from public.user_gamificacao_stats s
      left join public.profiles p on p.id = s.user_id
      where s.xp_semana_atual > 0
    ),
    top_n as (
      select * from ranking where posicao <= v_limite
    ),
    eu_fora as (
      select * from ranking
      where v_user_id is not null
        and user_id = v_user_id
        and posicao > v_limite
    ),
    combinado as (
      select * from top_n
      union all
      select * from eu_fora
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id',        user_id,
          'nome_display',   nome_display,
          'avatar_url',     avatar_url,
          'nivel',          nivel,
          'xp_total',       xp_total,
          'xp_semana_atual', xp_semana_atual,
          'posicao',        posicao,
          'is_me',          is_me
        )
        order by posicao
      ),
      '[]'::jsonb
    )
    from combinado
  );
end;
$function$;

revoke execute on function public.get_ranking_global(integer) from anon;
revoke execute on function public.get_ranking_semana(integer) from anon;
grant execute on function public.get_ranking_global(integer) to authenticated;
grant execute on function public.get_ranking_semana(integer) to authenticated;;
