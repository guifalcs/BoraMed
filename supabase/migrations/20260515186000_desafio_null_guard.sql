create or replace function public.responder_desafio_diario(
  p_alternativa_id uuid,
  p_tempo_segundos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id    uuid;
  v_hoje       date;
  v_questao_id uuid;
  v_alt        public.alternativa%rowtype;
  v_correta    boolean;
  v_xp_ganho   integer;
  v_total      integer;
  v_acertos    integer;
  v_novas      jsonb;
  v_stats      jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if p_alternativa_id is null then
    raise exception 'Alternativa não fornecida' using errcode = 'P0001';
  end if;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  select questao_id into v_questao_id
  from public.desafio_diario
  where data = v_hoje;

  if v_questao_id is null then
    raise exception 'Desafio não disponível hoje' using errcode = 'P0004';
  end if;

  if exists (
    select 1 from public.desafio_diario_resposta
    where user_id = v_user_id and data = v_hoje
  ) then
    raise exception 'Desafio já respondido hoje' using errcode = 'P0005';
  end if;

  select * into v_alt
  from public.alternativa
  where id = p_alternativa_id and questao_id = v_questao_id;

  if not found then
    raise exception 'Alternativa inválida para o desafio de hoje' using errcode = 'P0003';
  end if;

  v_correta  := v_alt.correta;
  v_xp_ganho := case when v_correta then 50 else 10 end;

  insert into public.desafio_diario_resposta (
    user_id, data, alternativa_id, correta, xp_ganho, tempo_segundos
  ) values (
    v_user_id, v_hoje, p_alternativa_id, v_correta, v_xp_ganho, p_tempo_segundos
  );

  insert into public.gamificacao_evento (
    user_id, tipo, xp, metadata, idempotency_key
  ) values (
    v_user_id,
    'desafio_diario',
    v_xp_ganho,
    jsonb_build_object(
      'data',          v_hoje,
      'correta',       v_correta,
      'alternativa_id', p_alternativa_id
    ),
    'desafio_diario:' || v_hoje::text
  )
  on conflict (user_id, idempotency_key) do nothing;

  select
    count(*)::integer,
    count(*) filter (where correta = true)::integer
  into v_total, v_acertos
  from public.desafio_diario_resposta
  where data = v_hoje;

  v_novas := public.verificar_conquistas_usuario(v_user_id);
  v_stats  := public.get_meu_xp();

  return jsonb_build_object(
    'ja_respondeu',          false,
    'correta',               v_correta,
    'xp_ganho',              v_xp_ganho,
    'novas_conquistas',      v_novas,
    'stats',                 v_stats,
    'estatistica', jsonb_build_object(
      'total_responderam', v_total,
      'percentual_acerto', case
        when v_total > 0
          then round((v_acertos::numeric / v_total) * 100)::integer
        else 0
      end
    )
  );
end;
$function$;

revoke execute on function public.responder_desafio_diario(uuid, integer) from anon;
grant execute on function public.responder_desafio_diario(uuid, integer) to authenticated;
