-- Expansão do catálogo de conquistas para 50 badges
-- Categorias: volume, streak, precisao, desafio, nivel, xp, exploracao, velocidade, secretas

insert into public.conquista_catalogo (
  id, nome, descricao, icone, categoria, xp_recompensa, secreta, ordem
) values
  -- ── Volume (simulados finalizados) ──
  ('volume_5',          'Cinco na conta',           'Finalize 5 simulados.',                              'trophy',           'volume',      50,   false, 15),
  ('volume_100',        'Centenário',               'Finalize 100 simulados.',                            'trophy',           'volume',     750,   false, 48),
  ('volume_200',        'Incansável',               'Finalize 200 simulados.',                            'trophy',           'volume',    1000,   false, 49),
  ('volume_500',        'Lenda dos simulados',      'Finalize 500 simulados.',                            'trophy',           'volume',    2000,   false, 50),

  -- ── Streak ──
  ('streak_60',         'Dois meses firme',         'Estude por 60 dias seguidos.',                       'shield',           'streak',    1000,   false, 38),
  ('streak_90',         'Trimestre de ferro',       'Estude por 90 dias seguidos.',                       'shield',           'streak',    1500,   false, 39),
  ('streak_180',        'Semestre imbatível',       'Estude por 180 dias seguidos.',                      'shield',           'streak',    2500,   false, 40),
  ('streak_365',        'Um ano inteiro',           'Estude por 365 dias seguidos.',                      'shield',           'streak',    5000,   false, 41),

  -- ── Precisão ──
  ('precisao_90',       'Precisão cirúrgica',       'Finalize 3 simulados com nota de 90% ou mais.',      'award',            'precisao',   600,   false, 56),
  ('nota_perfeita',     'Gabaritou!',               'Finalize um simulado com nota 100%.',                'award',            'precisao',   500,   false, 57),
  ('nota_perfeita_3',   'Perfeccionista',           'Finalize 3 simulados com nota 100%.',                'award',            'precisao',  1000,   false, 58),

  -- ── Desafio diário ──
  ('desafio_diario_14', 'Desafiante assíduo',       'Responda o desafio diário em 14 dias diferentes.',   'calendar-check-2', 'desafio',    200,   false, 66),
  ('desafio_diario_30', 'Mês de desafios',          'Responda o desafio diário em 30 dias diferentes.',   'calendar-check-2', 'desafio',    400,   false, 67),
  ('desafio_diario_50', 'Meio centenário',          'Responda o desafio diário em 50 dias diferentes.',   'calendar-check-2', 'desafio',    600,   false, 68),
  ('desafio_diario_100','Desafiante centenário',    'Responda o desafio diário em 100 dias diferentes.',  'calendar-check-2', 'desafio',   1000,   false, 69),

  -- ── Nível ──
  ('nivel_5',           'Nível 5',                  'Alcance o nível 5.',                                 'medal',            'nivel',      100,   false, 100),
  ('nivel_10',          'Dois dígitos',             'Alcance o nível 10.',                                'medal',            'nivel',      250,   false, 101),
  ('nivel_20',          'Veterano acadêmico',       'Alcance o nível 20.',                                'medal',            'nivel',      500,   false, 102),
  ('nivel_50',          'Elite médica',             'Alcance o nível 50.',                                'medal',            'nivel',     1500,   false, 103),

  -- ── XP total ──
  ('xp_1000',           'Primeiro milhar',          'Acumule 1.000 XP no total.',                         'flame',            'xp',          50,  false, 110),
  ('xp_5000',           'Cinco mil',                'Acumule 5.000 XP no total.',                         'flame',            'xp',         150,  false, 111),
  ('xp_10000',          'Dez mil forte',            'Acumule 10.000 XP no total.',                        'flame',            'xp',         300,  false, 112),
  ('xp_50000',          'Cinquenta mil',            'Acumule 50.000 XP no total.',                        'flame',            'xp',         750,  false, 113),
  ('xp_100000',         'Cem mil de XP',            'Acumule 100.000 XP no total.',                       'flame',            'xp',        1500,  false, 114),

  -- ── Exploração (temas e provas) ──
  ('explorador_3',      'Explorador',               'Responda questões de 3 temas diferentes.',           'compass',          'exploracao',  100,  false, 120),
  ('explorador_10',     'Multidisciplinar',         'Responda questões de 10 temas diferentes.',          'compass',          'exploracao',  300,  false, 121),
  ('explorador_20',     'Saber amplo',              'Responda questões de 20 temas diferentes.',          'compass',          'exploracao',  600,  false, 122),
  ('prova_completa',    'Prova completa',           'Finalize uma prova respondendo todas as questões.',  'clipboard-check',  'exploracao',  100,  false, 125),
  ('provas_5',          'Colecionador de provas',   'Finalize simulados de 5 provas diferentes.',         'clipboard-check',  'exploracao',  200,  false, 126),
  ('provas_10',         'Conhecedor do acervo',     'Finalize simulados de 10 provas diferentes.',        'clipboard-check',  'exploracao',  400,  false, 127),

  -- ── Velocidade / Tempo ──
  ('rapido',            'Relâmpago',                'Finalize um simulado em menos de 1 min por questão.','zap',              'velocidade',  100,  false, 130),
  ('horas_10',          'Maratonista',              'Acumule 10 horas de estudo em simulados.',           'clock',            'velocidade',  200,  false, 131),
  ('horas_50',          '50 horas de treino',       'Acumule 50 horas de estudo em simulados.',           'clock',            'velocidade',  500,  false, 132),
  ('horas_100',         'Centenário de horas',      'Acumule 100 horas de estudo em simulados.',          'clock',            'velocidade', 1000,  false, 133),

  -- ── Secretas (só aparecem após desbloqueio) ──
  ('noturno',           'Coruja noturna',           'Finalize um simulado entre meia-noite e 5h.',        'moon',             'secreta',      50,  true,  200),
  ('madrugador',        'Madrugador',               'Finalize um simulado entre 5h e 7h da manhã.',       'sunrise',          'secreta',      50,  true,  201),
  ('fim_de_semana',     'Guerreiro de fim de semana','Finalize 3 simulados no mesmo fim de semana.',      'calendar',         'secreta',      75,  true,  202),
  ('primeiro_dia',      'Dia 1',                    'Finalize um simulado no mesmo dia que criou a conta.','rocket',          'secreta',      25,  true,  203)
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

-- ── Atualizar get_minhas_conquistas para exibir secretas desbloqueadas ──

create or replace function public.get_minhas_conquistas()
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

  perform public.verificar_conquistas_usuario(v_user_id);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'nome', c.nome,
          'descricao', c.descricao,
          'icone', c.icone,
          'categoria', c.categoria,
          'xp_recompensa', c.xp_recompensa,
          'secreta', c.secreta,
          'desbloqueada_em', uc.desbloqueada_em
        )
        order by c.ordem
      ),
      '[]'::jsonb
    )
    from public.conquista_catalogo c
    left join public.user_conquista uc
      on uc.conquista_id = c.id
      and uc.user_id = v_user_id
    where c.ativa = true
      and (c.secreta = false or uc.desbloqueada_em is not null)
  );
end;
$function$;

-- ── Função de verificação expandida (50 conquistas) ──

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
  v_tentativas_90    integer;
  v_tentativas_100   integer;
  v_total_desafios   integer;
  v_temas_distintos  integer;
  v_provas_distintas integer;
  v_tem_completa     boolean;
  v_tempo_total_seg  bigint;
  v_tem_rapido       boolean;
  v_tem_noturno      boolean;
  v_tem_madrugador   boolean;
  v_fim_semana_3     boolean;
  v_primeiro_dia     boolean;
  v_novas            jsonb;
begin
  v_user_id := coalesce(p_user_id, auth.uid());
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'Sem permissão para verificar conquistas de outro usuário' using errcode = 'P0003';
  end if;

  -- Stats de gamificação
  select * into v_stats
  from public.user_gamificacao_stats
  where user_id = v_user_id;

  -- Tentativas finalizadas + notas
  select
    count(*)::integer,
    count(*) filter (where coalesce(nota, 0) >= 70)::integer,
    count(*) filter (where coalesce(nota, 0) >= 80)::integer,
    count(*) filter (where coalesce(nota, 0) >= 90)::integer,
    count(*) filter (where coalesce(nota, 0) = 100)::integer
  into v_total_tentativas, v_tentativas_70, v_tentativas_80, v_tentativas_90, v_tentativas_100
  from public.tentativa
  where user_id = v_user_id
    and status = 'finalizada'
    and modo <> 'visualizar';

  -- Desafios diários distintos
  select count(distinct data)::integer
  into v_total_desafios
  from public.desafio_diario_resposta
  where user_id = v_user_id;

  -- Temas distintos respondidos
  select count(distinct qt.tema_id)::integer
  into v_temas_distintos
  from public.tentativa_resposta tr
  join public.tentativa t on t.id = tr.tentativa_id
  join public.questao_tema qt on qt.questao_id = tr.questao_id
  where t.user_id = v_user_id
    and t.status = 'finalizada'
    and t.modo <> 'visualizar';

  -- Provas distintas finalizadas
  select count(distinct t.prova_id)::integer
  into v_provas_distintas
  from public.tentativa t
  where t.user_id = v_user_id
    and t.status = 'finalizada'
    and t.modo <> 'visualizar';

  -- Prova completa (respondeu todas as questões)
  select exists(
    select 1 from public.tentativa t
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and t.total_respondidas = t.total_questoes
      and t.total_questoes > 0
  ) into v_tem_completa;

  -- Tempo total acumulado
  select coalesce(sum(t.tempo_acumulado_segundos), 0)::bigint
  into v_tempo_total_seg
  from public.tentativa t
  where t.user_id = v_user_id
    and t.status = 'finalizada'
    and t.modo <> 'visualizar';

  -- Simulado rápido (< 60s por questão)
  select exists(
    select 1 from public.tentativa t
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and t.total_questoes > 0
      and t.tempo_acumulado_segundos > 0
      and (t.tempo_acumulado_segundos::numeric / t.total_questoes) < 60
  ) into v_tem_rapido;

  -- Noturno (finalizado entre 00:00 e 04:59 horário local BR)
  select exists(
    select 1 from public.tentativa t
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and extract(hour from t.finalizada_em at time zone 'America/Sao_Paulo') between 0 and 4
  ) into v_tem_noturno;

  -- Madrugador (finalizado entre 05:00 e 06:59 horário local BR)
  select exists(
    select 1 from public.tentativa t
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and extract(hour from t.finalizada_em at time zone 'America/Sao_Paulo') between 5 and 6
  ) into v_tem_madrugador;

  -- Fim de semana: 3+ simulados no mesmo fim de semana
  select exists(
    select 1
    from public.tentativa t
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and extract(isodow from t.finalizada_em at time zone 'America/Sao_Paulo') in (6, 7)
    group by date_trunc('week', t.finalizada_em at time zone 'America/Sao_Paulo')
    having count(*) >= 3
  ) into v_fim_semana_3;

  -- Primeiro dia: simulado finalizado no dia de criação da conta
  select exists(
    select 1 from public.tentativa t
    join auth.users u on u.id = t.user_id
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and (t.finalizada_em at time zone 'America/Sao_Paulo')::date
        = (u.created_at at time zone 'America/Sao_Paulo')::date
  ) into v_primeiro_dia;

  -- Gerar lista de conquistas elegíveis e inserir novas
  with elegiveis as (
    -- Volume
    select 'primeira_tentativa'::text as conquista_id where v_total_tentativas >= 1
    union all select 'volume_5'        where v_total_tentativas >= 5
    union all select 'volume_10'       where v_total_tentativas >= 10
    union all select 'volume_25'       where v_total_tentativas >= 25
    union all select 'volume_50'       where v_total_tentativas >= 50
    union all select 'volume_100'      where v_total_tentativas >= 100
    union all select 'volume_200'      where v_total_tentativas >= 200
    union all select 'volume_500'      where v_total_tentativas >= 500
    -- Streak
    union all select 'streak_3'        where coalesce(v_stats.streak_recorde, 0) >= 3
    union all select 'streak_7'        where coalesce(v_stats.streak_recorde, 0) >= 7
    union all select 'streak_14'       where coalesce(v_stats.streak_recorde, 0) >= 14
    union all select 'streak_30'       where coalesce(v_stats.streak_recorde, 0) >= 30
    union all select 'streak_60'       where coalesce(v_stats.streak_recorde, 0) >= 60
    union all select 'streak_90'       where coalesce(v_stats.streak_recorde, 0) >= 90
    union all select 'streak_180'      where coalesce(v_stats.streak_recorde, 0) >= 180
    union all select 'streak_365'      where coalesce(v_stats.streak_recorde, 0) >= 365
    -- Precisão
    union all select 'precisao_70'     where v_tentativas_70  >= 3
    union all select 'precisao_80'     where v_tentativas_80  >= 3
    union all select 'precisao_90'     where v_tentativas_90  >= 3
    union all select 'nota_perfeita'   where v_tentativas_100 >= 1
    union all select 'nota_perfeita_3' where v_tentativas_100 >= 3
    -- Desafio diário
    union all select 'desafio_diario_1'   where v_total_desafios >= 1
    union all select 'desafio_diario_7'   where v_total_desafios >= 7
    union all select 'desafio_diario_14'  where v_total_desafios >= 14
    union all select 'desafio_diario_30'  where v_total_desafios >= 30
    union all select 'desafio_diario_50'  where v_total_desafios >= 50
    union all select 'desafio_diario_100' where v_total_desafios >= 100
    -- Nível
    union all select 'nivel_5'    where coalesce(v_stats.nivel, 0) >= 5
    union all select 'nivel_10'   where coalesce(v_stats.nivel, 0) >= 10
    union all select 'nivel_20'   where coalesce(v_stats.nivel, 0) >= 20
    union all select 'nivel_50'   where coalesce(v_stats.nivel, 0) >= 50
    -- XP total
    union all select 'xp_1000'    where coalesce(v_stats.xp_total, 0) >= 1000
    union all select 'xp_5000'    where coalesce(v_stats.xp_total, 0) >= 5000
    union all select 'xp_10000'   where coalesce(v_stats.xp_total, 0) >= 10000
    union all select 'xp_50000'   where coalesce(v_stats.xp_total, 0) >= 50000
    union all select 'xp_100000'  where coalesce(v_stats.xp_total, 0) >= 100000
    -- Exploração
    union all select 'explorador_3'    where v_temas_distintos  >= 3
    union all select 'explorador_10'   where v_temas_distintos  >= 10
    union all select 'explorador_20'   where v_temas_distintos  >= 20
    union all select 'prova_completa'  where v_tem_completa
    union all select 'provas_5'        where v_provas_distintas >= 5
    union all select 'provas_10'       where v_provas_distintas >= 10
    -- Velocidade / Tempo
    union all select 'rapido'     where v_tem_rapido
    union all select 'horas_10'   where v_tempo_total_seg >= 36000
    union all select 'horas_50'   where v_tempo_total_seg >= 180000
    union all select 'horas_100'  where v_tempo_total_seg >= 360000
    -- Secretas
    union all select 'noturno'        where v_tem_noturno
    union all select 'madrugador'     where v_tem_madrugador
    union all select 'fim_de_semana'  where v_fim_semana_3
    union all select 'primeiro_dia'   where v_primeiro_dia
  ),
  inseridas as (
    insert into public.user_conquista (user_id, conquista_id)
    select v_user_id, e.conquista_id
    from elegiveis e
    where exists (select 1 from public.conquista_catalogo cc where cc.id = e.conquista_id and cc.ativa = true)
    on conflict do nothing
    returning conquista_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            c.id,
        'nome',          c.nome,
        'descricao',     c.descricao,
        'icone',         c.icone,
        'categoria',     c.categoria,
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
