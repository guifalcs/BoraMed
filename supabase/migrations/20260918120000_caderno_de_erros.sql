-- ============================================================================
-- Caderno de Erros — questões que o aluno errou, para revisão dirigida.
--
-- "Errada" usa a MESMA convenção de acerto de get_desempenho_por_tema/
-- get_historico_kpis (20260707150000): coalesce(tr.pontos::numeric,
-- tr.correta::int::numeric * 100) >= 70 é acerto; abaixo disso é erro. Olhamos
-- só a resposta MAIS RECENTE do aluno para cada questão (distinct on), em
-- tentativas finalizadas e modo <> 'visualizar' (mesmo corte usado em toda a
-- família de métricas de desempenho — visualizar não debita crédito nem conta
-- como tentativa real), excluindo `tr.anulada_usuario` e `questao.anulada`.
--
-- Gate de conteúdo: igual ao paywall de questao/alternativa
-- (20260624131517) — exige tem_assinatura_ativa() (gratuito fica de fora;
-- é recurso de assinante) e, para o tier essencial, só questões nacionais
-- (q.formato_prova IS NOT NULL — únicas que carregam N1/N2/teste_progresso/
-- integradora, ver 20260519144347/20260717150000).
--
-- Escrita em caderno_erro_status é SEMPRE via RPC SECURITY DEFINER (dono
-- bypassa RLS). A tabela não recebe grant de INSERT/UPDATE/DELETE para
-- `authenticated` — mesmo padrão de 20260609120000 (tentativa/tentativa_resposta).
--
-- Decisões tomadas por ambiguidade do pedido (documentar para revisão):
--  * Índice extra em (user_id) não foi criado: o unique (user_id, questao_id)
--    já é um btree com user_id como coluna líder e cobre buscas só por
--    user_id sem necessidade de índice duplicado.
--  * get_caderno_erros retorna `table(...)` (não jsonb) — mais simples de
--    tipar no client Supabase. Shape (nomes de coluna, `temas` como
--    text[], `disciplina` como sigla, `prova_id`/`tentativa_id` — não
--    `prova_nome`) foi ALINHADO ao contrato já existente em
--    frontend/src/app/core/services/caderno-erros.service.ts e
--    core/models/caderno-erros.ts (código já presente na árvore de
--    trabalho ao iniciar esta tarefa) em vez do texto literal do pedido.
--  * get_questao_para_refazer devolve o mesmo shape de `QuestaoComAlternativas`
--    usado em todo o resto do app (é isso que o <app-questao-card>, já
--    escrito no frontend, espera) em vez de um payload minimalista.
--    Narrativa de gabarito (explicacao/referencia/resposta_correta_texto/
--    resposta_modelo/pontos_chave/criterios_correcao/explicacao_alternativas)
--    fica null/vazia — só chega depois, na resposta de
--    responder_questao_avulsa. `alternativa.correta` TAMBÉM vem mascarado
--    (null) aqui: o gabarito não pode vazar no payload antes do aluno
--    responder (visível no Network tab). O `refazer-questao.component.ts`
--    não depende do `correta` desta RPC — ele reconstrói localmente
--    (`alternativas.map(a => ({...a, correta: a.id === corretaId}))`) usando
--    o `alternativa_correta_id` devolvido por responder_questao_avulsa.
--  * responder_questao_avulsa: se a resposta estiver errada, status volta
--    (ou permanece) 'pendente' mesmo que já estivesse 'dominada' antes —
--    entendimento de que errar de novo desfaz o "dominado".
--  * gerar_simulado_personalizado(p_apenas_erros=true) exige tem_assinatura_ativa()
--    (bloqueia o plano gratuito) — Caderno de Erros é recurso de assinante,
--    igual às demais RPCs desta migration. O bloqueio de tier essencial já
--    existe na função (P0015, incondicional) — não precisa de ajuste extra.
-- ============================================================================

------------------------------------------------------------------------------
-- 1) Tabela caderno_erro_status
------------------------------------------------------------------------------

create table public.caderno_erro_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  questao_id uuid not null references public.questao(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'dominada')),
  ultima_redo_correta boolean,
  ultima_redo_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, questao_id)
);

create index idx_caderno_erro_status_questao_id
  on public.caderno_erro_status (questao_id);

alter table public.caderno_erro_status enable row level security;

create trigger caderno_erro_status_atualizado_em_trigger
  before update on public.caderno_erro_status
  for each row execute function public.update_atualizado_em();

-- Mesmo padrão restritivo de banimento aplicado às demais tabelas de
-- conteúdo/tentativa (ver DO $$ ... $$ em 20260624131517_seguranca_paywall_conteudo_assinantes.sql).
create policy banidos_bloqueados
  on public.caderno_erro_status
  as restrictive
  for all
  to authenticated
  using (not public.is_banned())
  with check (not public.is_banned());

create policy caderno_erro_status_select_own
  on public.caderno_erro_status
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita só pelas
-- RPCs SECURITY DEFINER abaixo (dono da função bypassa RLS).
--
-- ⚠️ O default ACL do schema public (ALTER DEFAULT PRIVILEGES do dono
-- `postgres`) concede arwdDxtm (INSERT/UPDATE/DELETE incluídos) para
-- `authenticated`/`anon` automaticamente em toda tabela nova — precisa
-- REVOKE ALL explícito antes do GRANT seletivo, ou a tabela nasce gravável
-- direto. Mesma regressão documentada em db-pull-reverte-hardening-grants.
revoke all on table public.caderno_erro_status from anon, authenticated;
grant select on table public.caderno_erro_status to authenticated;
grant select, insert, update, delete on table public.caderno_erro_status to service_role;

------------------------------------------------------------------------------
-- 2) get_caderno_erros — lista as questões erradas pendentes/dominadas
------------------------------------------------------------------------------

create or replace function public.get_caderno_erros(
  p_tema_ids uuid[] default null,
  p_disciplina_ids uuid[] default null,
  p_tipo_questao text[] default null,
  p_status text default 'pendente'
)
returns table (
  questao_id uuid,
  enunciado text,
  tipo_questao text,
  formato text,
  formato_prova text,
  temas text[],
  disciplina text,
  prova_id uuid,
  tentativa_id uuid,
  erro_em timestamptz,
  status text,
  ultima_redo_correta boolean,
  ultima_redo_em timestamptz
)
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not public.tem_assinatura_ativa() then
    raise exception 'subscription_required: assinatura ativa necessaria' using errcode = 'P0009';
  end if;

  if p_status is not null and p_status not in ('pendente', 'dominada') then
    raise exception 'Status invalido: %', p_status using errcode = 'P0002';
  end if;

  v_tier := public.assinatura_tier();

  return query
  with ultima_resposta as (
    select distinct on (tr.questao_id)
      tr.questao_id,
      coalesce(tr.pontos::numeric, tr.correta::int::numeric * 100) as nota,
      t.finalizada_em,
      t.prova_id,
      t.id as tentativa_id
    from public.tentativa_resposta tr
    join public.tentativa t on t.id = tr.tentativa_id
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and tr.anulada_usuario = false
    order by tr.questao_id, t.finalizada_em desc nulls last, tr.respondida_em desc nulls last, tr.id desc
  )
  select
    q.id as questao_id,
    q.enunciado,
    q.tipo_questao,
    q.formato,
    q.formato_prova,
    coalesce((
      select array_agg(te.nome order by te.nome)
      from public.questao_tema qt
      join public.tema te on te.id = qt.tema_id
      where qt.questao_id = q.id
    ), array[]::text[]) as temas,
    d.sigla as disciplina,
    ur.prova_id,
    ur.tentativa_id,
    ur.finalizada_em as erro_em,
    coalesce(ces.status, 'pendente') as status,
    ces.ultima_redo_correta,
    ces.ultima_redo_em
  from ultima_resposta ur
  join public.questao q on q.id = ur.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  left join public.caderno_erro_status ces
    on ces.user_id = v_user_id and ces.questao_id = q.id
  where ur.nota < 70
    and q.anulada = false
    and (v_tier is distinct from 'essencial' or q.formato_prova is not null)
    and (p_status is null or coalesce(ces.status, 'pendente') = p_status)
    and (
      p_tema_ids is null or array_length(p_tema_ids, 1) is null
      or exists (
        select 1 from public.questao_tema qt2
        where qt2.questao_id = q.id and qt2.tema_id = any(p_tema_ids)
      )
    )
    and (
      p_disciplina_ids is null or array_length(p_disciplina_ids, 1) is null
      or q.disciplina_id = any(p_disciplina_ids)
    )
    and (
      p_tipo_questao is null or array_length(p_tipo_questao, 1) is null
      or q.tipo_questao = any(p_tipo_questao)
    )
  order by ur.finalizada_em desc nulls last, q.id;
end;
$$;

------------------------------------------------------------------------------
-- 3) get_caderno_erros_resumo — cartão-resumo (total, por tipo, tema mais
--    fraco, dominadas nos últimos 7 dias)
------------------------------------------------------------------------------

create or replace function public.get_caderno_erros_resumo()
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_total_pendentes bigint;
  v_por_tipo jsonb;
  v_tema_mais_fraco text;
  v_dominadas_7d bigint;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not public.tem_assinatura_ativa() then
    raise exception 'subscription_required: assinatura ativa necessaria' using errcode = 'P0009';
  end if;

  v_tier := public.assinatura_tier();

  with ultima_resposta as (
    select distinct on (tr.questao_id)
      tr.questao_id,
      coalesce(tr.pontos::numeric, tr.correta::int::numeric * 100) as nota
    from public.tentativa_resposta tr
    join public.tentativa t on t.id = tr.tentativa_id
    where t.user_id = v_user_id
      and t.status = 'finalizada'
      and t.modo <> 'visualizar'
      and tr.anulada_usuario = false
    order by tr.questao_id, t.finalizada_em desc nulls last, tr.respondida_em desc nulls last, tr.id desc
  ),
  erradas_pendentes as (
    select q.id, q.tipo_questao
    from ultima_resposta ur
    join public.questao q on q.id = ur.questao_id
    left join public.caderno_erro_status ces
      on ces.user_id = v_user_id and ces.questao_id = q.id
    where ur.nota < 70
      and q.anulada = false
      and (v_tier is distinct from 'essencial' or q.formato_prova is not null)
      and coalesce(ces.status, 'pendente') = 'pendente'
  )
  -- por_tipo_questao sempre com as 3 chaves (default 0) — o client tipa como
  -- Record<TipoQuestaoCadernoErros, number> sem chave opcional.
  select
    count(*),
    jsonb_build_object(
      'nacional', count(*) filter (where tipo_questao = 'nacional'),
      'processual', count(*) filter (where tipo_questao = 'processual'),
      'laboratorio', count(*) filter (where tipo_questao = 'laboratorio')
    )
  into v_total_pendentes, v_por_tipo
  from erradas_pendentes;

  -- Tema mais fraco: mesmo critério (corte mínimo de 3 respostas) de
  -- get_desempenho_por_tema (20260707150000) — desempenho geral do aluno,
  -- não restrito ao pool de erros pendentes.
  select tema_nome
  into v_tema_mais_fraco
  from public.get_desempenho_por_tema()
  order by taxa asc
  limit 1;

  select count(*)
  into v_dominadas_7d
  from public.caderno_erro_status
  where user_id = v_user_id
    and status = 'dominada'
    and atualizado_em >= now() - interval '7 days';

  return jsonb_build_object(
    'total_pendentes', coalesce(v_total_pendentes, 0),
    'por_tipo_questao', coalesce(v_por_tipo, '{}'::jsonb),
    'tema_mais_fraco', v_tema_mais_fraco,
    'dominadas_ultimos_7_dias', coalesce(v_dominadas_7d, 0)
  );
end;
$$;

------------------------------------------------------------------------------
-- 4) get_questao_para_refazer — devolve a questão no MESMO shape usado pelo
--    resto do app (QuestaoComAlternativas, reaproveitado pelo
--    <app-questao-card>), sem NENHUM gabarito: nem a narrativa
--    (explicacao/referencia/resposta_correta_texto/resposta_modelo/
--    pontos_chave/criterios_correcao — null/vazios) nem `alternativa.correta`
--    (sempre null). O gabarito só chega depois, na resposta de
--    responder_questao_avulsa (`alternativa_correta_id` + `explicacao`).
--    O refazer-questao.component.ts reconstrói o highlight localmente
--    (`alternativas.map(a => ({...a, correta: a.id === corretaId}))`) usando
--    esse retorno — não depende de `correta` vir populado aqui.
------------------------------------------------------------------------------

create or replace function public.get_questao_para_refazer(p_questao_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_questao public.questao;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not public.tem_assinatura_ativa() then
    raise exception 'subscription_required: assinatura ativa necessaria' using errcode = 'P0009';
  end if;

  v_tier := public.assinatura_tier();

  select q.* into v_questao
  from public.questao q
  where q.id = p_questao_id
    and q.status = 'ativa'
    and q.anulada = false;

  if not found then
    raise exception 'Questao nao encontrada' using errcode = 'P0003';
  end if;

  if v_tier = 'essencial' and v_questao.formato_prova is null then
    raise exception 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' using errcode = 'P0015';
  end if;

  select jsonb_build_object(
    'id', v_questao.id,
    'codigo_externo', v_questao.codigo_externo,
    'enunciado_apoio', v_questao.enunciado_apoio,
    'enunciado', v_questao.enunciado,
    'imagem_url', v_questao.imagem_url,
    'imagem_legenda', v_questao.imagem_legenda,
    'formato', v_questao.formato,
    'tipo_questao', v_questao.tipo_questao,
    'resposta_correta_texto', null,
    'respostas_aceitas', null,
    'resposta_modelo', null,
    'pontos_chave', '[]'::jsonb,
    'criterios_correcao', null,
    'explicacao', null,
    'explicacao_alternativas', null,
    'recurso_texto', v_questao.recurso_texto,
    'anulada', v_questao.anulada,
    'referencia', null,
    'disciplina', d.sigla,
    'periodo', d.periodo::integer,
    'prova_id', v_questao.prova_id,
    'ordem_na_prova', v_questao.ordem_na_prova,
    'fonte', v_questao.fonte,
    'vezes_respondida', v_questao.vezes_respondida,
    'vezes_acertada', v_questao.vezes_acertada,
    'taxa_acerto', v_questao.taxa_acerto,
    'status', v_questao.status,
    'revisado', v_questao.revisado,
    'autor_id', v_questao.autor_id,
    'revisor_id', v_questao.revisor_id,
    'aprovada_em', v_questao.aprovada_em,
    'publicada_em', v_questao.publicada_em,
    'origem_geracao', v_questao.origem_geracao,
    'nivel_bloom', v_questao.nivel_bloom,
    'formato_prova', v_questao.formato_prova,
    'criado_em', v_questao.criado_em,
    'atualizado_em', v_questao.atualizado_em,
    'alternativas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'questao_id', a.questao_id,
        'letra', a.letra,
        'texto', a.texto,
        'correta', null,
        'ordem', a.ordem,
        'imagem_url', a.imagem_url
      ) order by a.ordem), '[]'::jsonb)
      from public.alternativa a
      where a.questao_id = v_questao.id
    ),
    'temas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', te.id,
        'nome', te.nome,
        'disciplina_id', te.disciplina_id,
        'disciplina', td.sigla,
        'periodo', td.periodo::integer,
        'parent_id', te.parent_id,
        'criado_em', te.criado_em
      ) order by te.nome), '[]'::jsonb)
      from public.questao_tema qt
      join public.tema te on te.id = qt.tema_id
      left join public.disciplina td on td.id = te.disciplina_id
      where qt.questao_id = v_questao.id
    )
  )
  into v_result
  from public.questao q
  left join public.disciplina d on d.id = q.disciplina_id
  where q.id = v_questao.id;

  return v_result;
end;
$$;

------------------------------------------------------------------------------
-- 5) responder_questao_avulsa — corrige server-side, NÃO grava tentativa,
--    só atualiza caderno_erro_status.
------------------------------------------------------------------------------

create or replace function public.responder_questao_avulsa(
  p_questao_id uuid,
  p_alternativa_id uuid default null,
  p_resposta_texto text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_questao public.questao;
  v_alternativa_correta_id uuid;
  v_correta boolean;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not public.tem_assinatura_ativa() then
    raise exception 'subscription_required: assinatura ativa necessaria' using errcode = 'P0009';
  end if;

  v_tier := public.assinatura_tier();

  select q.* into v_questao
  from public.questao q
  where q.id = p_questao_id
    and q.status = 'ativa'
    and q.anulada = false;

  if not found then
    raise exception 'Questao nao encontrada' using errcode = 'P0003';
  end if;

  if v_tier = 'essencial' and v_questao.formato_prova is null then
    raise exception 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' using errcode = 'P0015';
  end if;

  -- Correção determinística: só multipla_escolha, verdadeiro_falso e
  -- associacao, que no schema atual são modeladas como seleção de UMA
  -- alternativa (mesma comparação usada em finalizar_tentativa, 20260707130000).
  if v_questao.formato = 'resposta_aberta_curta' then
    raise exception 'formato_nao_suportado: refazer avulso nao suporta questoes discursivas (resposta_aberta_curta)'
      using errcode = 'P0011';
  end if;

  if p_alternativa_id is null then
    raise exception 'Alternativa obrigatoria para este formato' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.alternativa a
    where a.id = p_alternativa_id and a.questao_id = p_questao_id
  ) then
    raise exception 'Alternativa nao pertence a questao informada' using errcode = 'P0002';
  end if;

  select a.id into v_alternativa_correta_id
  from public.alternativa a
  where a.questao_id = p_questao_id
    and a.correta = true
  order by a.ordem
  limit 1;

  v_correta := (p_alternativa_id = v_alternativa_correta_id);
  v_status := case when v_correta then 'dominada' else 'pendente' end;

  insert into public.caderno_erro_status (
    user_id, questao_id, status, ultima_redo_correta, ultima_redo_em
  )
  values (
    v_user_id, p_questao_id, v_status, v_correta, now()
  )
  on conflict (user_id, questao_id) do update
  set status = excluded.status,
      ultima_redo_correta = excluded.ultima_redo_correta,
      ultima_redo_em = excluded.ultima_redo_em,
      atualizado_em = now();

  return jsonb_build_object(
    'correta', v_correta,
    'alternativa_correta_id', v_alternativa_correta_id,
    'explicacao', v_questao.explicacao
  );
end;
$$;

------------------------------------------------------------------------------
-- 6) marcar_questao_dominada — upsert simples de status, sem tocar em
--    ultima_redo_*.
------------------------------------------------------------------------------

create or replace function public.marcar_questao_dominada(
  p_questao_id uuid,
  p_dominada boolean
)
returns public.caderno_erro_status
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := case when p_dominada then 'dominada' else 'pendente' end;
  v_row public.caderno_erro_status;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not public.tem_assinatura_ativa() then
    raise exception 'subscription_required: assinatura ativa necessaria' using errcode = 'P0009';
  end if;

  if not exists (select 1 from public.questao q where q.id = p_questao_id) then
    raise exception 'Questao nao encontrada' using errcode = 'P0003';
  end if;

  insert into public.caderno_erro_status (user_id, questao_id, status)
  values (v_user_id, p_questao_id, v_status)
  on conflict (user_id, questao_id) do update
  set status = excluded.status,
      atualizado_em = now()
  returning * into v_row;

  return v_row;
end;
$$;

------------------------------------------------------------------------------
-- 7) gerar_simulado_personalizado — novo parâmetro p_apenas_erros no FINAL da
--    assinatura (não quebra chamadas existentes). Base: versão vigente de
--    20260908120000_free_tier_monta_simulado.sql. Todo o resto do
--    comportamento (dedup por grupo_equivalencia_id, gate de tier
--    P0015/P0016, criação de prova+tentativa+tentativa_resposta) é idêntico.
------------------------------------------------------------------------------

-- CREATE OR REPLACE não substitui uma função com número de parâmetros
-- diferente — cria um OVERLOAD novo. Isso deixaria as duas assinaturas
-- (6 e 7 parâmetros) coexistindo, ambíguas para o PostgREST em chamadas por
-- nome de parâmetro. Precisa DROP explícito da assinatura antiga primeiro.
drop function if exists public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text);

create or replace function public.gerar_simulado_personalizado(
  p_tema_ids uuid[] default null::uuid[],
  p_qtd integer default 10,
  p_modo text default 'simulado'::text,
  p_tipo_questao text default null::text,
  p_formato text default null::text,
  p_formato_questao text default 'fechadas'::text,
  p_apenas_erros boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_user_id uuid;
  v_prova_id uuid;
  v_tentativa record;
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
  v_nivel text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_nivel := public.nivel_acesso();

  -- Essencial continua fora: o plano vende o acervo nacional PRONTO, e o
  -- montador sorteia de todo o acervo. Gratuito passa a entrar, gastando o
  -- crédito único de simulado montado (bucket separado do nacional).
  IF v_nivel = 'essencial' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
  END IF;

  -- Caderno de Erros é recurso de assinante: "montar simulado só de erros"
  -- não entra no crédito único do plano gratuito.
  IF p_apenas_erros AND v_nivel = 'gratuito' THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  IF v_nivel = 'gratuito' AND public.tentativas_gratuitas_restantes_montado() <= 0 THEN
    RAISE EXCEPTION 'free_limit_reached: limite de tentativas do plano gratuito atingido' USING ERRCODE = 'P0016';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  IF p_qtd < 1 OR p_qtd > 50 THEN
    RAISE EXCEPTION 'Quantidade deve ser entre 1 e 50' USING ERRCODE = 'P0006';
  END IF;

  IF p_tipo_questao IS NOT NULL AND p_tipo_questao NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Tipo de questao invalido: %', p_tipo_questao USING ERRCODE = 'P0007';
  END IF;

  IF p_formato IS NOT NULL AND p_formato NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Formato invalido: %', p_formato USING ERRCODE = 'P0008';
  END IF;

  IF p_formato_questao NOT IN ('fechadas', 'discursivas', 'misto') THEN
    RAISE EXCEPTION 'Formato de questao invalido: %', p_formato_questao USING ERRCODE = 'P0010';
  END IF;

  SELECT array(
    WITH grupos_entregues AS (
      SELECT DISTINCT coalesce(q2.grupo_equivalencia_id, q2.id) AS grupo
      FROM public.tentativa t
      JOIN public.tentativa_resposta tr ON tr.tentativa_id = t.id
      JOIN public.questao q2 ON q2.id = tr.questao_id
      WHERE t.user_id = v_user_id
        AND t.modo <> 'visualizar'
    ),
    -- Mesma convenção de "errada" de get_caderno_erros: resposta mais recente
    -- do aluno para a questão, em tentativa finalizada e modo <> visualizar,
    -- nota (pontos ou correta*100) abaixo de 70, ainda pendente no caderno.
    ultima_resposta AS (
      SELECT DISTINCT ON (tr.questao_id)
        tr.questao_id,
        coalesce(tr.pontos::numeric, tr.correta::int::numeric * 100) AS nota
      FROM public.tentativa_resposta tr
      JOIN public.tentativa t ON t.id = tr.tentativa_id
      JOIN public.questao q3 ON q3.id = tr.questao_id
      WHERE t.user_id = v_user_id
        AND t.status = 'finalizada'
        AND t.modo <> 'visualizar'
        AND tr.anulada_usuario = false
        AND q3.anulada = false
      ORDER BY tr.questao_id, t.finalizada_em DESC NULLS LAST, tr.respondida_em DESC NULLS LAST, tr.id DESC
    ),
    erros_pendentes AS (
      SELECT ur.questao_id
      FROM ultima_resposta ur
      LEFT JOIN public.caderno_erro_status ces
        ON ces.user_id = v_user_id AND ces.questao_id = ur.questao_id
      WHERE ur.nota < 70
        AND coalesce(ces.status, 'pendente') = 'pendente'
    ),
    candidatas AS (
      SELECT q.id, coalesce(q.grupo_equivalencia_id, q.id) AS grupo
      FROM public.questao q
      WHERE q.status = 'ativa'
        AND (NOT p_apenas_erros OR EXISTS (
          SELECT 1 FROM erros_pendentes ep WHERE ep.questao_id = q.id
        ))
        AND (
          (p_formato_questao = 'fechadas' AND q.formato <> 'resposta_aberta_curta')
          OR (p_formato_questao = 'discursivas' AND q.formato = 'resposta_aberta_curta')
          OR p_formato_questao = 'misto'
        )
        AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
        AND (p_tipo_questao IS DISTINCT FROM 'laboratorio' OR q.imagem_url IS NOT NULL)
        AND (
          p_formato IS NULL
          OR p_formato = 'laboratorio'
          OR q.formato_prova IS NULL
          OR q.formato_prova = p_formato
          OR (q.formato_prova IN ('N1', 'N2', 'teste_progresso', 'integradora') AND p_formato = 'nacional')
        )
        AND (
          p_tema_ids IS NULL
          OR array_length(p_tema_ids, 1) IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.questao_tema qt
            WHERE qt.questao_id = q.id
              AND qt.tema_id = ANY(p_tema_ids)
          )
        )
    ),
    por_grupo AS (
      SELECT c.id,
             (ge.grupo IS NOT NULL) AS entregue,
             row_number() OVER (PARTITION BY c.grupo ORDER BY random()) AS rn
      FROM candidatas c
      LEFT JOIN grupos_entregues ge ON ge.grupo = c.grupo
    )
    SELECT id
    FROM por_grupo
    WHERE rn = 1
    ORDER BY entregue ASC, random()
    LIMIT p_qtd
  )
  INTO v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := CASE
      WHEN p_apenas_erros THEN 'Simulado dos meus erros - '
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
      WHEN p_apenas_erros THEN 'Simulado dos meus erros - '
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado - '
    END || string_agg(t.nome, ', ' ORDER BY t.nome) || ' - ' || v_total || 'q'
    INTO v_nome
    FROM public.tema t
    WHERE t.id = ANY(p_tema_ids);
  END IF;

  IF length(v_nome) > 200 THEN
    v_nome := left(v_nome, 197) || '...';
  END IF;

  INSERT INTO public.prova (
    faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo,
    qtd_questoes, publicada, arquivada
  )
  VALUES (
    NULL, v_nome, 0, 'autoral', 'personalizado', p_formato, NULL, NULL,
    v_total, FALSE, FALSE
  )
  RETURNING id INTO v_prova_id;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, v_prova_id, p_modo, 'em_andamento', v_total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, selected.questao_id, selected.ordem::integer
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_prova_id,
      'ordem_na_prova', selected.ordem::integer,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'tipo_questao', q.tipo_questao,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN p_modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
      'recurso_texto', q.recurso_texto,
      'anulada', q.anulada,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY selected.ordem
  )
  INTO v_questoes
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem)
  JOIN public.questao q ON q.id = selected.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id;

  RETURN jsonb_build_object(
    'prova_id', v_prova_id,
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$
;

------------------------------------------------------------------------------
-- 8) Grants finais (escritos à mão — mesmo aviso anti-regressão de db pull/db
--    diff documentado em 20260624131517 e 20260908120000).
------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_caderno_erros(uuid[], uuid[], text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_caderno_erros(uuid[], uuid[], text[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_caderno_erros_resumo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_caderno_erros_resumo() TO authenticated;

REVOKE ALL ON FUNCTION public.get_questao_para_refazer(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_questao_para_refazer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.responder_questao_avulsa(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.responder_questao_avulsa(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.marcar_questao_dominada(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_questao_dominada(uuid, boolean) TO authenticated;

-- Assinatura antiga (6 parâmetros) foi DROPada explicitamente acima; só a
-- NOVA (7 parâmetros) existe agora. Revoga/concede nela.
REVOKE ALL ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text, boolean) TO authenticated;

COMMENT ON TABLE public.caderno_erro_status IS
  'Status por aluno/questao no Caderno de Erros: pendente (a revisar) ou dominada. Escrita só via RPC security definer.';

COMMENT ON FUNCTION public.get_caderno_erros(uuid[], uuid[], text[], text) IS
  'Lista questoes erradas (resposta mais recente < 70 pontos) do aluno logado, com filtros de tema/disciplina/tipo/status. Gate: tem_assinatura_ativa(); essencial so ve nacional.';

COMMENT ON FUNCTION public.get_caderno_erros_resumo() IS
  'Resumo do Caderno de Erros: total pendentes, contagem por tipo_questao, tema mais fraco (corte >=3, mesmo criterio de get_desempenho_por_tema) e dominadas nos ultimos 7 dias.';

COMMENT ON FUNCTION public.get_questao_para_refazer(uuid) IS
  'Devolve a questao para o aluno refazer avulso, sem gabarito/explicacao. Gate: tem_assinatura_ativa(); essencial so nacional.';

COMMENT ON FUNCTION public.responder_questao_avulsa(uuid, uuid, text) IS
  'Corrige uma resposta avulsa server-side (so formatos deterministicos) e atualiza caderno_erro_status. NAO grava tentativa/tentativa_resposta.';

COMMENT ON FUNCTION public.marcar_questao_dominada(uuid, boolean) IS
  'Upsert manual de status (pendente/dominada) em caderno_erro_status, sem alterar ultima_redo_*.';

COMMENT ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text, boolean) IS
  'Gera simulado personalizado. p_apenas_erros (novo, default false) restringe o pool as questoes erradas pendentes do aluno logado; exige assinatura ativa mesmo no plano gratuito.';
