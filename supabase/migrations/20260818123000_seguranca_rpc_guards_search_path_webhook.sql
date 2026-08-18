-- ═══════════════════════════════════════════════════════════════════════════
-- Segurança: guardas de auth em RPCs SECURITY DEFINER, search_path com pg_temp,
-- revogação de EXECUTE de anon e tabela de idempotência do webhook do MP.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS (não regenerar via db pull/db diff):
-- este arquivo revoga EXECUTE de anon/public em RPCs sensíveis. Um db pull
-- posterior pode re-emitir grants default — revisar o diff sempre.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. verificar_conquistas_usuario: fecha bypass de identidade via NULL ────
-- Antes: `p_user_id <> auth.uid()` avaliava NULL quando auth.uid() era NULL
-- (chamada anônima), e a guarda não disparava — a função rodava como DEFINER
-- para QUALQUER p_user_id. Agora usa IS DISTINCT FROM (NULL-safe).
CREATE OR REPLACE FUNCTION public.verificar_conquistas_usuario(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if p_user_id is not null and p_user_id is distinct from auth.uid() then
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
$function$;

revoke execute on function public.verificar_conquistas_usuario(uuid) from public, anon;
grant execute on function public.verificar_conquistas_usuario(uuid) to authenticated, service_role;

-- ─── 2. listar_comentarios_questao: exige autenticação ──────────────────────
-- Antes: SECURITY DEFINER sem nenhuma checagem de auth — se executável por
-- anon, expunha comentários e identidade de alunos (nome, avatar, prefixo do
-- e-mail) sem login, ignorando RLS.
CREATE OR REPLACE FUNCTION public.listar_comentarios_questao(p_questao_id uuid, p_ordenacao text DEFAULT 'relevante'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_total integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  select count(*) into v_total from public.questao_comentario
  where questao_id = p_questao_id and parent_id is null and status = 'ativo';

  with raizes as (
    select qc.id, qc.parent_id, qc.user_id as autor_id,
      case when qc.status = 'removido' then null else qc.conteudo end as conteudo,
      qc.status, qc.editado, qc.likes, qc.dislikes, qc.criado_em,
      (qc.user_id = v_user_id) as is_me,
      case when coalesce(p.competir_publico, true)
        then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
        else 'Anônimo' end as nome_display,
      case when coalesce(p.competir_publico, true) then p.avatar_url else null end as avatar_url,
      case when coalesce(p.competir_publico, true) then qc.user_id
           when qc.user_id = v_user_id then qc.user_id else null end as user_id_display,
      coalesce((select v.valor from public.questao_comentario_voto v where v.comentario_id = qc.id and v.user_id = v_user_id), 0) as meu_voto
    from public.questao_comentario qc
    left join public.profiles p on p.id = qc.user_id
    where qc.questao_id = p_questao_id and qc.parent_id is null
      and (qc.status = 'ativo' or exists (select 1 from public.questao_comentario r where r.parent_id = qc.id and r.status = 'ativo'))
  ),
  respostas_por_raiz as (
    select qr.parent_id,
      jsonb_agg(jsonb_build_object(
        'id', qr.id, 'parent_id', qr.parent_id,
        'conteudo', case when qr.status = 'removido' then null else qr.conteudo end,
        'status', qr.status, 'editado', qr.editado,
        'nome_display', case when coalesce(pr.competir_publico, true) then coalesce(nullif(pr.nome_completo, ''), split_part(pr.email, '@', 1), 'Aluno') else 'Anônimo' end,
        'avatar_url', case when coalesce(pr.competir_publico, true) then pr.avatar_url else null end,
        'user_id', case when coalesce(pr.competir_publico, true) then qr.user_id when qr.user_id = v_user_id then qr.user_id else null end,
        'is_me', (qr.user_id = v_user_id),
        'likes', qr.likes, 'dislikes', qr.dislikes,
        'meu_voto', coalesce((select v.valor from public.questao_comentario_voto v where v.comentario_id = qr.id and v.user_id = v_user_id), 0),
        'criado_em', qr.criado_em, 'respostas', '[]'::jsonb
      ) order by qr.criado_em asc) as respostas
    from public.questao_comentario qr
    left join public.profiles pr on pr.id = qr.user_id
    where qr.parent_id in (select id from raizes) and qr.status = 'ativo'
    group by qr.parent_id
  )
  select jsonb_build_object(
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'parent_id', r.parent_id, 'conteudo', r.conteudo,
        'status', r.status, 'editado', r.editado,
        'nome_display', r.nome_display, 'avatar_url', r.avatar_url, 'user_id', r.user_id_display,
        'is_me', r.is_me, 'likes', r.likes, 'dislikes', r.dislikes, 'meu_voto', r.meu_voto,
        'criado_em', r.criado_em, 'respostas', coalesce(rpr.respostas, '[]'::jsonb)
      ) order by
        case when p_ordenacao = 'relevante' then -(r.likes - r.dislikes) else 0 end asc,
        case when p_ordenacao = 'antigo' then extract(epoch from r.criado_em) else -extract(epoch from r.criado_em) end asc)
      from raizes r left join respostas_por_raiz rpr on rpr.parent_id = r.id
    ), '[]'::jsonb),
    'total', v_total
  ) into v_result;
  return v_result;
end;
$function$;

revoke execute on function public.listar_comentarios_questao(uuid, text) from public, anon;
grant execute on function public.listar_comentarios_questao(uuid, text) to authenticated, service_role;

-- ─── 3. search_path: padroniza 'public', 'pg_temp' ──────────────────────────
-- Sem pg_temp explícito no fim, o Postgres o resolve implicitamente ANTES dos
-- schemas listados — num SECURITY DEFINER isso permite sombreamento por objetos
-- temporários do chamador. limite_tentativas_gratuitas e nivel_no_segmento não
-- tinham SET search_path algum (flag do advisor 0011).
alter function public.is_admin(uuid) set search_path to 'public', 'pg_temp';
alter function public.is_super_admin(uuid) set search_path to 'public', 'pg_temp';
alter function public.is_banned(uuid) set search_path to 'public', 'pg_temp';
alter function public.admin_listar_notificacoes(integer) set search_path to 'public', 'pg_temp';
alter function public.limite_tentativas_gratuitas() set search_path to 'public', 'pg_temp';
alter function public.nivel_no_segmento(text, text) set search_path to 'public', 'pg_temp';

-- ─── 4. Idempotência do webhook Mercado Pago ────────────────────────────────
-- O mp-webhook registra cada evento aqui antes de processar; PK duplicada
-- (23505) = replay/retransmissão → responde 200 sem reprocessar.
-- Acesso somente via service_role (mesmo padrão de palavra_proibida).
create table if not exists public.mp_webhook_evento (
  id            text primary key,
  payload       jsonb,
  processado_em timestamptz not null default now()
);

alter table public.mp_webhook_evento enable row level security;
revoke all on table public.mp_webhook_evento from anon;
revoke all on table public.mp_webhook_evento from authenticated;
grant all on table public.mp_webhook_evento to service_role;

comment on table public.mp_webhook_evento is
  'Dedup de eventos do webhook MP (proteção contra replay). Sem policies de propósito: acesso só via service_role.';
