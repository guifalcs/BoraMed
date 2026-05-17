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
  v_result    jsonb;
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
      'disciplina',              q.disciplina,
      'periodo',                 q.periodo,
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
            'disciplina', t.disciplina,
            'periodo',    t.periodo,
            'parent_id',  t.parent_id,
            'criado_em',  t.criado_em
          )
        )
        from public.questao_tema qt
        join public.tema t on t.id = qt.tema_id
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
  where tr.tentativa_id = p_tentativa_id
    and q.status = 'ativa';

  v_result := jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes',  coalesce(v_questoes, '[]'::jsonb)
  );

  return v_result;
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
    'freeze_usado_hoje', v_freeze_uso_hoje,
    'dias_para_proximo_marco', coalesce(v_dias_para_proximo_marco, 0)
  );
end;
$function$;

revoke execute on function public.get_streak_estudo_v2() from public;
revoke execute on function public.get_streak_estudo_v2() from anon;
grant execute on function public.get_streak_estudo_v2() to authenticated;;
