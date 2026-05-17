create table "public"."conquista_catalogo" (
  "id" text not null,
  "nome" text not null,
  "descricao" text not null,
  "icone" text not null,
  "categoria" text not null,
  "xp_recompensa" integer not null default 0,
  "secreta" boolean not null default false,
  "ativa" boolean not null default true,
  "ordem" integer not null default 0,
  "criado_em" timestamp with time zone not null default now(),
  constraint "conquista_catalogo_pkey" primary key ("id"),
  constraint "conquista_catalogo_xp_recompensa_check" check ("xp_recompensa" >= 0)
);

create table "public"."user_conquista" (
  "user_id" uuid not null,
  "conquista_id" text not null,
  "desbloqueada_em" timestamp with time zone not null default now(),
  constraint "user_conquista_pkey" primary key ("user_id", "conquista_id"),
  constraint "user_conquista_user_id_fkey" foreign key ("user_id") references auth.users("id") on delete cascade,
  constraint "user_conquista_conquista_id_fkey" foreign key ("conquista_id") references public.conquista_catalogo("id") on delete cascade
);

create index "idx_user_conquista_user_desbloqueada"
  on "public"."user_conquista" using btree ("user_id", "desbloqueada_em" desc);

alter table "public"."conquista_catalogo" enable row level security;
alter table "public"."user_conquista" enable row level security;

create policy "conquista_catalogo_select_active"
  on "public"."conquista_catalogo"
  as permissive for select to authenticated
  using (ativa = true and secreta = false);

create policy "user_conquista_select_own"
  on "public"."user_conquista"
  as permissive for select to authenticated
  using (((select auth.uid()) = user_id));

revoke all on table "public"."conquista_catalogo" from anon;
revoke all on table "public"."user_conquista" from anon;
grant select on table "public"."conquista_catalogo" to authenticated;
grant select on table "public"."user_conquista" to authenticated;

insert into public.conquista_catalogo (id, nome, descricao, icone, categoria, xp_recompensa, secreta, ordem)
values
  ('primeira_tentativa', 'Primeira tentativa', 'Finalize seu primeiro simulado.', 'medal', 'volume', 25, false, 10),
  ('streak_3', 'Ritmo inicial', 'Estude por 3 dias seguidos.', 'flame', 'streak', 50, false, 20),
  ('streak_7', 'Semana completa', 'Estude por 7 dias seguidos.', 'shield', 'streak', 150, false, 30),
  ('volume_10', 'Dez na conta', 'Finalize 10 simulados.', 'trophy', 'volume', 100, false, 40),
  ('precisao_70', 'Boa precisão', 'Finalize 3 simulados com nota de 70% ou mais.', 'award', 'precisao', 200, false, 50)
on conflict (id) do update set
  nome = excluded.nome, descricao = excluded.descricao, icone = excluded.icone,
  categoria = excluded.categoria, xp_recompensa = excluded.xp_recompensa,
  secreta = excluded.secreta, ordem = excluded.ordem, ativa = true;

create or replace function public.verificar_conquistas_usuario(p_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid; v_stats public.user_gamificacao_stats%rowtype;
  v_total_tentativas integer; v_tentativas_70 integer; v_novas jsonb;
begin
  v_user_id := coalesce(p_user_id, auth.uid());
  if v_user_id is null then raise exception 'Usuário não autenticado' using errcode = 'P0001'; end if;
  if p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'Sem permissão' using errcode = 'P0003';
  end if;
  select * into v_stats from public.user_gamificacao_stats where user_id = v_user_id;
  select count(*)::integer, count(*) filter (where coalesce(nota,0) >= 70)::integer
  into v_total_tentativas, v_tentativas_70
  from public.tentativa where user_id = v_user_id and status = 'finalizada' and modo <> 'visualizar';
  with elegiveis as (
    select 'primeira_tentativa'::text as conquista_id where v_total_tentativas >= 1
    union all select 'streak_3' where coalesce(v_stats.streak_recorde,0) >= 3
    union all select 'streak_7' where coalesce(v_stats.streak_recorde,0) >= 7
    union all select 'volume_10' where v_total_tentativas >= 10
    union all select 'precisao_70' where v_tentativas_70 >= 3
  ),
  inseridas as (
    insert into public.user_conquista (user_id, conquista_id)
    select v_user_id, e.conquista_id from elegiveis e on conflict do nothing returning conquista_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'nome',c.nome,'descricao',c.descricao,'icone',c.icone,
    'categoria',c.categoria,'xp_recompensa',c.xp_recompensa) order by c.ordem),'[]'::jsonb)
  into v_novas from inseridas i join public.conquista_catalogo c on c.id = i.conquista_id;
  return v_novas;
end;
$function$;

create or replace function public.get_minhas_conquistas()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Usuário não autenticado' using errcode = 'P0001'; end if;
  perform public.verificar_conquistas_usuario(v_user_id);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'nome',c.nome,'descricao',c.descricao,'icone',c.icone,
      'categoria',c.categoria,'xp_recompensa',c.xp_recompensa,
      'secreta',c.secreta,'desbloqueada_em',uc.desbloqueada_em) order by c.ordem),'[]'::jsonb)
    from public.conquista_catalogo c
    left join public.user_conquista uc on uc.conquista_id = c.id and uc.user_id = v_user_id
    where c.ativa = true and c.secreta = false
  );
end;
$function$;

create or replace function public.conceder_xp_tentativa(p_tentativa_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid; v_tentativa public.tentativa%rowtype; v_idempotency_key text;
  v_base integer; v_bonus_nota integer; v_bonus_dificuldade integer; v_bonus_tempo integer;
  v_xp_calculado integer; v_xp_hoje integer; v_xp_concedido integer;
  v_tempo_medio numeric; v_stats jsonb; v_novas_conquistas jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Usuário não autenticado' using errcode = 'P0001'; end if;
  select * into v_tentativa from public.tentativa where id = p_tentativa_id and user_id = v_user_id;
  if not found then raise exception 'Tentativa não encontrada' using errcode = 'P0003'; end if;
  v_idempotency_key := 'tentativa:' || p_tentativa_id::text;
  if exists (select 1 from public.gamificacao_evento where user_id = v_user_id and idempotency_key = v_idempotency_key) then
    return jsonb_build_object('xp_ganho',0,'ja_concedido',true,'novas_conquistas',public.verificar_conquistas_usuario(v_user_id),'stats',public.get_meu_xp());
  end if;
  if v_tentativa.status <> 'finalizada' or v_tentativa.modo = 'visualizar' then
    return jsonb_build_object('xp_ganho',0,'ja_concedido',false,'novas_conquistas','[]'::jsonb,'stats',public.get_meu_xp());
  end if;
  v_base := greatest(coalesce(v_tentativa.acertos,0),0) * 10;
  v_bonus_nota := case when coalesce(v_tentativa.nota,0) >= 70 then 50 when coalesce(v_tentativa.nota,0) >= 50 then 20 else 0 end;
  select coalesce(sum(coalesce(q.dificuldade,0)*2),0)::integer into v_bonus_dificuldade
  from public.tentativa_resposta tr join public.questao q on q.id = tr.questao_id
  where tr.tentativa_id = p_tentativa_id and tr.correta = true;
  v_tempo_medio := case when coalesce(v_tentativa.total_respondidas,0) > 0 then v_tentativa.tempo_acumulado_segundos::numeric / v_tentativa.total_respondidas else null end;
  v_bonus_tempo := case when v_tempo_medio is not null and v_tempo_medio < 60 and coalesce(v_tentativa.nota,0) >= 50 then 15 else 0 end;
  v_xp_calculado := v_base + v_bonus_nota + v_bonus_dificuldade + v_bonus_tempo;
  select coalesce(sum(xp),0)::integer into v_xp_hoje from public.gamificacao_evento
  where user_id = v_user_id and tipo = 'tentativa' and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;
  v_xp_concedido := least(v_xp_calculado, greatest(500 - v_xp_hoje, 0));
  insert into public.gamificacao_evento (user_id, tipo, xp, metadata, idempotency_key)
  values (v_user_id, 'tentativa', v_xp_concedido,
    jsonb_build_object('tentativa_id',p_tentativa_id,'xp_calculado',v_xp_calculado,
      'base',v_base,'bonus_nota',v_bonus_nota,'bonus_dificuldade',v_bonus_dificuldade,'bonus_tempo',v_bonus_tempo),
    v_idempotency_key);
  v_novas_conquistas := public.verificar_conquistas_usuario(v_user_id);
  v_stats := public.get_meu_xp();
  return jsonb_build_object('xp_ganho',v_xp_concedido,'ja_concedido',false,'novas_conquistas',v_novas_conquistas,'stats',v_stats);
end;
$function$;

revoke execute on function public.verificar_conquistas_usuario(uuid) from public;
revoke execute on function public.get_minhas_conquistas() from public;
revoke execute on function public.conceder_xp_tentativa(uuid) from public;
grant execute on function public.verificar_conquistas_usuario(uuid) to authenticated;
grant execute on function public.get_minhas_conquistas() to authenticated;
grant execute on function public.conceder_xp_tentativa(uuid) to authenticated;;
