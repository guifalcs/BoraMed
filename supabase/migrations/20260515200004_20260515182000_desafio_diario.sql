alter table public.questao
  add column if not exists apto_desafio_diario boolean not null default true;

create table "public"."desafio_diario" (
  "data"       date        not null,
  "questao_id" uuid        not null,
  "criado_em"  timestamptz not null default now(),
  constraint "desafio_diario_pkey" primary key ("data"),
  constraint "desafio_diario_questao_id_fkey"
    foreign key ("questao_id") references public.questao("id") on delete restrict
);

create table "public"."desafio_diario_resposta" (
  "user_id"        uuid        not null,
  "data"           date        not null,
  "alternativa_id" uuid,
  "correta"        boolean     not null,
  "xp_ganho"       integer     not null default 0,
  "tempo_segundos" integer,
  "respondido_em"  timestamptz not null default now(),
  constraint "desafio_diario_resposta_pkey" primary key ("user_id", "data"),
  constraint "desafio_diario_resposta_user_id_fkey"
    foreign key ("user_id") references auth.users("id") on delete cascade,
  constraint "desafio_diario_resposta_alternativa_id_fkey"
    foreign key ("alternativa_id") references public.alternativa("id") on delete set null,
  constraint "desafio_diario_resposta_xp_check" check ("xp_ganho" >= 0)
);

create index "idx_desafio_diario_resposta_data"
  on "public"."desafio_diario_resposta" using btree ("data", "correta");

alter table "public"."desafio_diario" enable row level security;
alter table "public"."desafio_diario_resposta" enable row level security;

create policy "desafio_diario_select"
  on "public"."desafio_diario" as permissive for select to authenticated using (true);

create policy "desafio_diario_resposta_select_own"
  on "public"."desafio_diario_resposta" as permissive for select to authenticated
  using (((select auth.uid()) = user_id));

revoke all on table "public"."desafio_diario" from anon;
revoke all on table "public"."desafio_diario_resposta" from anon;
grant select on table "public"."desafio_diario" to authenticated;
grant select on table "public"."desafio_diario_resposta" to authenticated;

create or replace function public.get_desafio_diario()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid; v_hoje date; v_questao_id uuid;
  v_resposta public.desafio_diario_resposta%rowtype;
  v_total integer; v_acertos integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Usuário não autenticado' using errcode = 'P0001'; end if;
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  insert into public.desafio_diario (data, questao_id)
  select v_hoje, q.id from public.questao q
  where q.apto_desafio_diario = true order by random() limit 1
  on conflict (data) do nothing;

  select questao_id into v_questao_id from public.desafio_diario where data = v_hoje;

  if v_questao_id is null then
    return jsonb_build_object('disponivel', false, 'mensagem', 'Nenhuma questão disponível para o desafio de hoje.');
  end if;

  select * into v_resposta from public.desafio_diario_resposta where user_id = v_user_id and data = v_hoje;

  select count(*)::integer, count(*) filter (where correta = true)::integer
  into v_total, v_acertos
  from public.desafio_diario_resposta where data = v_hoje;

  if found and v_resposta.user_id is not null then
    return jsonb_build_object(
      'disponivel', true, 'data', v_hoje,
      'questao', (select jsonb_build_object('id',q.id,'enunciado',q.enunciado,'enunciado_apoio',q.enunciado_apoio,
        'imagem_url',q.imagem_url,'dificuldade',q.dificuldade,'disciplina',q.disciplina,'explicacao',q.explicacao)
        from public.questao q where q.id = v_questao_id),
      'alternativas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',a.id,'letra',a.letra,'texto',a.texto,'ordem',a.ordem,'correta',a.correta) order by a.ordem),'[]'::jsonb)
        from public.alternativa a where a.questao_id = v_questao_id),
      'minha_resposta', jsonb_build_object('alternativa_id',v_resposta.alternativa_id,
        'correta',v_resposta.correta,'xp_ganho',v_resposta.xp_ganho,'respondido_em',v_resposta.respondido_em),
      'estatistica', jsonb_build_object('total_responderam',v_total,
        'percentual_acerto', case when v_total > 0 then round((v_acertos::numeric/v_total)*100)::integer else 0 end)
    );
  else
    return jsonb_build_object(
      'disponivel', true, 'data', v_hoje,
      'questao', (select jsonb_build_object('id',q.id,'enunciado',q.enunciado,'enunciado_apoio',q.enunciado_apoio,
        'imagem_url',q.imagem_url,'dificuldade',q.dificuldade,'disciplina',q.disciplina)
        from public.questao q where q.id = v_questao_id),
      'alternativas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',a.id,'letra',a.letra,'texto',a.texto,'ordem',a.ordem) order by a.ordem),'[]'::jsonb)
        from public.alternativa a where a.questao_id = v_questao_id),
      'minha_resposta', null,
      'estatistica', jsonb_build_object('total_responderam',v_total,
        'percentual_acerto', case when v_total > 0 then round((v_acertos::numeric/v_total)*100)::integer else 0 end)
    );
  end if;
end;
$function$;

create or replace function public.responder_desafio_diario(
  p_alternativa_id uuid,
  p_tempo_segundos integer default null
)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid; v_hoje date; v_questao_id uuid;
  v_alt public.alternativa%rowtype;
  v_correta boolean; v_xp_ganho integer;
  v_total integer; v_acertos integer;
  v_novas jsonb; v_stats jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Usuário não autenticado' using errcode = 'P0001'; end if;
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  select questao_id into v_questao_id from public.desafio_diario where data = v_hoje;
  if v_questao_id is null then raise exception 'Desafio não disponível hoje' using errcode = 'P0004'; end if;

  if exists (select 1 from public.desafio_diario_resposta where user_id = v_user_id and data = v_hoje) then
    raise exception 'Desafio já respondido hoje' using errcode = 'P0005';
  end if;

  select * into v_alt from public.alternativa where id = p_alternativa_id and questao_id = v_questao_id;
  if not found then raise exception 'Alternativa inválida para o desafio de hoje' using errcode = 'P0003'; end if;

  v_correta := v_alt.correta;
  v_xp_ganho := case when v_correta then 50 else 10 end;

  insert into public.desafio_diario_resposta (user_id, data, alternativa_id, correta, xp_ganho, tempo_segundos)
  values (v_user_id, v_hoje, p_alternativa_id, v_correta, v_xp_ganho, p_tempo_segundos);

  insert into public.gamificacao_evento (user_id, tipo, xp, metadata, idempotency_key)
  values (v_user_id, 'desafio_diario', v_xp_ganho,
    jsonb_build_object('data',v_hoje,'correta',v_correta,'alternativa_id',p_alternativa_id),
    'desafio_diario:' || v_hoje::text)
  on conflict (user_id, idempotency_key) do nothing;

  select count(*)::integer, count(*) filter (where correta = true)::integer
  into v_total, v_acertos from public.desafio_diario_resposta where data = v_hoje;

  v_novas := public.verificar_conquistas_usuario(v_user_id);
  v_stats := public.get_meu_xp();

  return jsonb_build_object(
    'ja_respondeu', false, 'correta', v_correta, 'xp_ganho', v_xp_ganho,
    'novas_conquistas', v_novas, 'stats', v_stats,
    'estatistica', jsonb_build_object('total_responderam', v_total,
      'percentual_acerto', case when v_total > 0 then round((v_acertos::numeric/v_total)*100)::integer else 0 end)
  );
end;
$function$;

revoke execute on function public.get_desafio_diario() from public;
revoke execute on function public.responder_desafio_diario(uuid, integer) from public;
grant execute on function public.get_desafio_diario() to authenticated;
grant execute on function public.responder_desafio_diario(uuid, integer) to authenticated;;
