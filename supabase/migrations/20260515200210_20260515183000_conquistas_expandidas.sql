-- Novos badges no catálogo
insert into public.conquista_catalogo (
  id, nome, descricao, icone, categoria, xp_recompensa, secreta, ordem
) values
  ('streak_14',       'Foco de 2 semanas',        'Estude por 14 dias seguidos.',                     'shield',           'streak',   300,  false, 35),
  ('streak_30',       'Mês dedicado',              'Estude por 30 dias seguidos.',                     'shield',           'streak',   750,  false, 37),
  ('volume_25',       'Aluno dedicado',            'Finalize 25 simulados.',                           'trophy',           'volume',   200,  false, 45),
  ('volume_50',       'Veterano',                  'Finalize 50 simulados.',                           'trophy',           'volume',   500,  false, 47),
  ('precisao_80',     'Alta precisão',             'Finalize 3 simulados com nota de 80% ou mais.',    'award',            'precisao', 400,  false, 55),
  ('desafio_diario_1','Primeiro desafio',          'Responda o desafio diário pela primeira vez.',     'calendar-check-2', 'desafio',  25,   false, 60),
  ('desafio_diario_7','Uma semana de desafios',    'Responda o desafio diário em 7 dias diferentes.', 'calendar-check-2', 'desafio',  100,  false, 65)
on conflict (id) do update
set
  nome          = excluded.nome,
  descricao     = excluded.descricao,
  icone         = excluded.icone,
  categoria     = excluded.categoria,
  xp_recompensa = excluded.xp_recompensa,
  secreta       = excluded.secreta,
  ordem         = excluded.ordem,
  ativa         = true;

create or replace function public.verificar_conquistas_usuario(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id          uuid;
  v_stats            public.user_gamificacao_stats%rowtype;
  v_total_tentativas integer;
  v_tentativas_70    integer;
  v_tentativas_80    integer;
  v_total_desafios   integer;
  v_novas            jsonb;
begin
  v_user_id := coalesce(p_user_id, auth.uid());
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'Sem permissão para verificar conquistas de outro usuário' using errcode = 'P0003';
  end if;

  select * into v_stats
  from public.user_gamificacao_stats
  where user_id = v_user_id;

  select
    count(*)::integer,
    count(*) filter (where coalesce(nota, 0) >= 70)::integer,
    count(*) filter (where coalesce(nota, 0) >= 80)::integer
  into v_total_tentativas, v_tentativas_70, v_tentativas_80
  from public.tentativa
  where user_id = v_user_id
    and status = 'finalizada'
    and modo <> 'visualizar';

  select count(distinct data)::integer
  into v_total_desafios
  from public.desafio_diario_resposta
  where user_id = v_user_id;

  with elegiveis as (
    select 'primeira_tentativa'::text as conquista_id
    where v_total_tentativas >= 1
    union all
    select 'streak_3'
    where coalesce(v_stats.streak_recorde, 0) >= 3
    union all
    select 'streak_7'
    where coalesce(v_stats.streak_recorde, 0) >= 7
    union all
    select 'streak_14'
    where coalesce(v_stats.streak_recorde, 0) >= 14
    union all
    select 'streak_30'
    where coalesce(v_stats.streak_recorde, 0) >= 30
    union all
    select 'volume_10'
    where v_total_tentativas >= 10
    union all
    select 'volume_25'
    where v_total_tentativas >= 25
    union all
    select 'volume_50'
    where v_total_tentativas >= 50
    union all
    select 'precisao_70'
    where v_tentativas_70 >= 3
    union all
    select 'precisao_80'
    where v_tentativas_80 >= 3
    union all
    select 'desafio_diario_1'
    where v_total_desafios >= 1
    union all
    select 'desafio_diario_7'
    where v_total_desafios >= 7
  ),
  inseridas as (
    insert into public.user_conquista (user_id, conquista_id)
    select v_user_id, e.conquista_id
    from elegiveis e
    on conflict do nothing
    returning conquista_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',           c.id,
        'nome',         c.nome,
        'descricao',    c.descricao,
        'icone',        c.icone,
        'categoria',    c.categoria,
        'xp_recompensa', c.xp_recompensa
      )
      order by c.ordem
    ),
    '[]'::jsonb
  )
  into v_novas
  from inseridas i
  join public.conquista_catalogo c on c.id = i.conquista_id;

  return v_novas;
end;
$function$;;
