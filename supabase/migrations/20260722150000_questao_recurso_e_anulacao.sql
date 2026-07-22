-- ============================================================================
-- Recurso e anulação de questões
--
-- Três conceitos independentes:
--   1. questao.recurso_texto  — texto de recurso (anulação/modificação pela
--      faculdade) que o aluno vê num botão. Enquanto houver recurso cadastrado,
--      o aluno NÃO pode anular a questão por conta própria — só visualizar.
--   2. questao.anulada         — anulação global (admin). A questão continua
--      visível/respondível, mas NÃO conta em nenhuma métrica daqui pra frente.
--   3. tentativa_resposta.anulada_usuario — anulação individual do aluno numa
--      tentativa ativa. Só permitida em questões SEM recurso e não anuladas
--      pelo admin. A questão sai das métricas daquela tentativa.
--
-- Predicado canônico de exclusão nas métricas:
--   (q.anulada OR tr.anulada_usuario)  ⇒ resposta fora de nota, acertos,
--   estatísticas da questão e distribuição por tema.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: este arquivo redefine RPCs SECURITY
-- DEFINER cujos GRANTs foram endurecidos em migrations anteriores
-- (20260624125610, 20260707120000, 20260707130000, 20260707150000). CREATE OR
-- REPLACE preserva os privilégios existentes; os GRANTs abaixo são reafirmados
-- por segurança. NÃO regenerar via `db pull`/`db diff`.
-- ============================================================================

------------------------------------------------------------------------------
-- 1. Schema — colunas novas + grants + índice
------------------------------------------------------------------------------

alter table public.questao
  add column if not exists recurso_texto text,
  add column if not exists anulada boolean not null default false;

comment on column public.questao.recurso_texto is
  'Texto do recurso (anulação/modificação pela faculdade) exibido ao aluno. Enquanto preenchido, o aluno não pode anular a questão por conta própria — só visualizar.';
comment on column public.questao.anulada is
  'Anulação global (admin). Questão segue visível/respondível, mas fora de todas as métricas daqui pra frente.';

alter table public.tentativa_resposta
  add column if not exists anulada_usuario boolean not null default false;

comment on column public.tentativa_resposta.anulada_usuario is
  'Aluno anulou esta questão na tentativa (só quando a questão não tem recurso nem anulação do admin). Exclui a resposta das métricas da tentativa.';

-- recurso_texto e anulada NÃO são gabarito: podem ser lidos por authenticated
-- (o SELECT direto de `questao` foi endurecido a colunas explícitas em
-- 20260624125610; sem este grant a lista do admin não traria os campos).
grant select (recurso_texto, anulada) on public.questao to authenticated;

-- Índice parcial: buscas/relatórios de questões anuladas.
create index if not exists idx_questao_anulada on public.questao (anulada) where anulada = true;

------------------------------------------------------------------------------
-- 2. RPC anular_questao_usuario — aluno anula/desanula a questão na tentativa
------------------------------------------------------------------------------

create or replace function public.anular_questao_usuario(
  p_tentativa_id uuid, p_questao_id uuid, p_anular boolean
)
returns public.tentativa_resposta
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_questao record;
  v_resposta public.tentativa_resposta;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.tentativa t
    where t.id = p_tentativa_id and t.user_id = v_user_id and t.status <> 'finalizada'
  ) then
    raise exception 'Tentativa nao encontrada, finalizada ou sem permissao' using errcode = 'P0003';
  end if;

  select q.anulada, q.recurso_texto
  into v_questao
  from public.questao q
  where q.id = p_questao_id;

  if not found then
    raise exception 'Questao nao encontrada' using errcode = 'P0004';
  end if;

  -- Só questões sem recurso e não anuladas pelo admin podem ser anuladas
  -- pelo aluno. (Desanular é sempre permitido.)
  if coalesce(p_anular, false) then
    if v_questao.recurso_texto is not null and btrim(v_questao.recurso_texto) <> '' then
      raise exception 'Questao com recurso cadastrado nao pode ser anulada pelo usuario' using errcode = 'P0011';
    end if;
    if v_questao.anulada then
      raise exception 'Questao ja anulada pela administracao' using errcode = 'P0012';
    end if;
  end if;

  update public.tentativa_resposta tr
  set anulada_usuario = coalesce(p_anular, false)
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = p_questao_id
  returning * into v_resposta;

  if not found then
    raise exception 'Resposta nao encontrada para a tentativa' using errcode = 'P0005';
  end if;

  return v_resposta;
end;
$$;

revoke all on function public.anular_questao_usuario(uuid, uuid, boolean) from public, anon;
grant execute on function public.anular_questao_usuario(uuid, uuid, boolean) to authenticated;

------------------------------------------------------------------------------
-- 3. consolidar_pontos_tentativa — anuladas fora do denominador e das stats
------------------------------------------------------------------------------

create or replace function public.consolidar_pontos_tentativa(p_tentativa_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tentativa record;
  v_total integer;
  v_sem_ia integer;
  v_soma numeric;
begin
  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
  for update;

  if not found or v_tentativa.status <> 'finalizada' or v_tentativa.total_pontuaveis is not null then
    return; -- não finalizada ou já consolidada
  end if;

  -- Anuladas (admin ou usuário) saem por completo do cálculo da nota.
  select
    count(*) filter (where not (q.anulada or tr.anulada_usuario)),
    count(*) filter (where not (q.anulada or tr.anulada_usuario) and rc.status = 'sem_ia'),
    coalesce(sum(
      case when (q.anulada or tr.anulada_usuario) then 0
           when rc.status = 'sem_ia' then 0
           else coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100, 0)
      end
    ), 0)
  into v_total, v_sem_ia, v_soma
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.resposta_correcao rc on rc.tentativa_resposta_id = tr.id
  where tr.tentativa_id = p_tentativa_id;

  update public.tentativa
  set pontos = v_soma,
      total_pontuaveis = v_total - v_sem_ia,
      nota = round(v_soma / nullif(v_total - v_sem_ia, 0), 1)
  where id = p_tentativa_id;

  -- Stats das questões abertas corrigidas (D17: acerto = pontos >= 70).
  -- Anuladas ficam fora das estatísticas (também estão fora da nota).
  update public.questao q
  set vezes_respondida = q.vezes_respondida + 1,
      vezes_acertada = q.vezes_acertada + case when tr.pontos >= 70 then 1 else 0 end,
      taxa_acerto = round(
        ((q.vezes_acertada + case when tr.pontos >= 70 then 1 else 0 end)::numeric
          / (q.vezes_respondida + 1)) * 100,
        2
      )
  from public.tentativa_resposta tr
  join public.resposta_correcao rc on rc.tentativa_resposta_id = tr.id
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = q.id
    and q.formato = 'resposta_aberta_curta'
    and rc.status = 'corrigida'
    and tr.respondida_em is not null
    and not (q.anulada or tr.anulada_usuario);
end;
$$;

revoke all on function public.consolidar_pontos_tentativa(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 4. montar_resultado_tentativa — expõe recurso_texto/anulada; anuladas fora
--    da distribuição por tema (respostas trazem anulada_usuario via row_to_json)
------------------------------------------------------------------------------

create or replace function public.montar_resultado_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tentativa record;
  v_questoes jsonb;
  v_respostas jsonb;
  v_distribuicao jsonb;
begin
  select * into v_tentativa from public.tentativa where id = p_tentativa_id;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', q.resposta_modelo,
      'pontos_chave', coalesce(q.pontos_chave, '[]'::jsonb),
      'recurso_texto', q.recurso_texto,
      'anulada', q.anulada,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', a.correta,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) order by a.ordem), '[]'::jsonb)
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) order by t.nome), '[]'::jsonb)
        from public.questao_tema qt
        join public.tema t on t.id = qt.tema_id
        left join public.disciplina td on td.id = t.disciplina_id
        where qt.questao_id = q.id
      )
    )
    order by coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id;

  select jsonb_agg(
    row_to_json(tr)::jsonb || jsonb_build_object(
      'correcao', (
        select row_to_json(rc)::jsonb
        from public.resposta_correcao rc
        where rc.tentativa_resposta_id = tr.id
      )
    )
    order by coalesce(tr.ordem_na_tentativa, 2147483647), tr.id
  )
  into v_respostas
  from public.tentativa_resposta tr
  where tr.tentativa_id = p_tentativa_id;

  select jsonb_agg(
    jsonb_build_object(
      'tema', jsonb_build_object(
        'id', sub.tema_id,
        'nome', sub.tema_nome,
        'disciplina_id', sub.disciplina_id,
        'disciplina', sub.disciplina_sigla,
        'periodo', sub.disciplina_periodo,
        'parent_id', sub.parent_id,
        'criado_em', sub.criado_em
      ),
      'total', sub.total,
      'acertos', sub.acertos
    )
    order by sub.tema_nome
  )
  into v_distribuicao
  from (
    select
      t.id as tema_id,
      t.nome as tema_nome,
      t.disciplina_id,
      d.sigla as disciplina_sigla,
      d.periodo::integer as disciplina_periodo,
      t.parent_id,
      t.criado_em,
      count(tr.id)::integer as total,
      -- Expressão canônica: MC acerta com correta=true (100), aberta com pontos>=70
      count(tr.id) filter (
        where coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100) >= 70
      )::integer as acertos
    from public.tentativa_resposta tr
    join public.questao qq on qq.id = tr.questao_id
    join public.questao_tema qt on qt.questao_id = tr.questao_id
    join public.tema t on t.id = qt.tema_id
    left join public.disciplina d on d.id = t.disciplina_id
    where tr.tentativa_id = p_tentativa_id
      and not (qq.anulada or tr.anulada_usuario)
    group by t.id, t.nome, t.disciplina_id, d.sigla, d.periodo, t.parent_id, t.criado_em
  ) sub;

  return jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'respostas', coalesce(v_respostas, '[]'::jsonb),
    'distribuicao_temas', coalesce(v_distribuicao, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.montar_resultado_tentativa(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 5. finalizar_tentativa — anuladas fora de acertos/respondidas e das stats
------------------------------------------------------------------------------

create or replace function public.finalizar_tentativa(
  p_tentativa_id uuid, p_tempo_segundos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid;
  v_tentativa record;
  v_acertos integer;
  v_total_respondidas integer;
  v_pendentes integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status <> 'finalizada' then
    -- Gabarito objetivo: só para questões com alternativas (abertas ficam NULL;
    -- a pontuação delas vem de tentativa_resposta.pontos via IA).
    update public.tentativa_resposta tr
    set correta = (
      tr.alternativa_id is not null
      and tr.alternativa_id = (
        select a.id
        from public.alternativa a
        where a.questao_id = tr.questao_id
          and a.correta = true
        order by a.ordem
        limit 1
      )
    )
    from public.questao q
    where tr.tentativa_id = p_tentativa_id
      and q.id = tr.questao_id
      and q.formato <> 'resposta_aberta_curta';

    -- Anuladas (admin ou usuário) ficam fora de acertos e respondidas.
    select
      count(*) filter (where tr.correta = true and not (q.anulada or tr.anulada_usuario)),
      count(*) filter (where tr.respondida_em is not null and not (q.anulada or tr.anulada_usuario))
    into v_acertos, v_total_respondidas
    from public.tentativa_resposta tr
    join public.questao q on q.id = tr.questao_id
    where tr.tentativa_id = p_tentativa_id;

    -- Nota fica NULL até a consolidação (inline abaixo quando não há correções
    -- de IA pendentes — caminho de tentativa só-MC, comportamento idêntico ao anterior).
    update public.tentativa
    set status = 'finalizada',
        finalizada_em = now(),
        acertos = v_acertos,
        total_respondidas = v_total_respondidas,
        nota = null,
        pontos = null,
        total_pontuaveis = null,
        tempo_acumulado_segundos = coalesce(p_tempo_segundos, tempo_acumulado_segundos)
    where id = p_tentativa_id;

    -- Stats das questões objetivas (abertas: em consolidar_pontos_tentativa).
    -- Anuladas ficam fora das estatísticas globais da questão.
    update public.questao q
    set vezes_respondida = q.vezes_respondida + 1,
        vezes_acertada = q.vezes_acertada + case when tr.correta then 1 else 0 end,
        taxa_acerto = round(
          ((q.vezes_acertada + case when tr.correta then 1 else 0 end)::numeric
            / (q.vezes_respondida + 1)) * 100,
          2
        )
    from public.tentativa_resposta tr
    where tr.tentativa_id = p_tentativa_id
      and tr.questao_id = q.id
      and q.formato <> 'resposta_aberta_curta'
      and tr.respondida_em is not null
      and not (q.anulada or tr.anulada_usuario);
  end if;

  select count(*) into v_pendentes
  from public.resposta_correcao rc
  join public.tentativa_resposta tr on tr.id = rc.tentativa_resposta_id
  where tr.tentativa_id = p_tentativa_id
    and rc.status in ('pendente', 'corrigindo', 'erro');

  if v_pendentes = 0 then
    perform public.consolidar_pontos_tentativa(p_tentativa_id);
  end if;

  return public.montar_resultado_tentativa(p_tentativa_id)
    || jsonb_build_object('correcoes_pendentes', v_pendentes);
end;
$$;

revoke all on function public.finalizar_tentativa(uuid, integer) from public, anon;
grant execute on function public.finalizar_tentativa(uuid, integer) to authenticated;

------------------------------------------------------------------------------
-- 6. iniciar_tentativa — expõe recurso_texto/anulada nas questões
--    (base: 20260717142000 — gate de tier essencial)
------------------------------------------------------------------------------

create or replace function public.iniciar_tentativa(p_prova_id uuid, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id uuid;
  v_prova record;
  v_tentativa record;
  v_questoes jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo', 'visualizar') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  SELECT p.*, count(pq.questao_id) FILTER (WHERE q.status = 'ativa') AS total
  INTO v_prova
  FROM public.prova p
  LEFT JOIN public.prova_questao pq ON pq.prova_id = p.id
  LEFT JOIN public.questao q ON q.id = pq.questao_id
  WHERE p.id = p_prova_id
  GROUP BY p.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova nao encontrada' USING ERRCODE = 'P0003';
  END IF;

  IF v_prova.total = 0 THEN
    RAISE EXCEPTION 'A prova nao possui questoes ativas' USING ERRCODE = 'P0004';
  END IF;

  -- Tier essencial só acessa treinos de formato nacional.
  IF public.assinatura_tier() = 'essencial' AND v_prova.formato IS DISTINCT FROM 'nacional' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
  END IF;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, q.id, row_number() OVER (ORDER BY pq.ordem, q.id)::integer
  FROM public.prova_questao pq
  JOIN public.questao q ON q.id = pq.questao_id
  WHERE pq.prova_id = p_prova_id
    AND q.status = 'ativa'
  ORDER BY pq.ordem, q.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', p_prova_id,
      'ordem_na_prova', tr.ordem_na_tentativa,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
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
    ORDER BY tr.ordem_na_tentativa
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = v_tentativa.id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$$;

revoke all on function public.iniciar_tentativa(uuid, text) from public, anon;
grant execute on function public.iniciar_tentativa(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- 7. retomar_tentativa — expõe recurso_texto/anulada nas questões
--    (base: 20260707130000)
------------------------------------------------------------------------------

create or replace function public.retomar_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id uuid;
  v_tentativa record;
  v_questoes jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa nao encontrada ou sem permissao' USING ERRCODE = 'P0003';
  END IF;

  IF v_tentativa.status = 'finalizada' THEN
    RAISE EXCEPTION 'Tentativa ja finalizada' USING ERRCODE = 'P0005';
  END IF;

  UPDATE public.tentativa
  SET status = 'em_andamento',
      pausada_em = NULL
  WHERE id = p_tentativa_id
  RETURNING * INTO v_tentativa;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN v_tentativa.modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
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
          'correta', CASE WHEN v_tentativa.modo = 'simulado' THEN NULL ELSE a.correta END,
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
    ORDER BY coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = p_tentativa_id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$$;

------------------------------------------------------------------------------
-- 8. gerar_simulado_personalizado — expõe recurso_texto/anulada nas questões
--    (base: 20260717150000; seleção/sorteio inalterados)
------------------------------------------------------------------------------

create or replace function public.gerar_simulado_personalizado(
  p_tema_ids uuid[] default null,
  p_qtd integer default 10,
  p_modo text default 'simulado',
  p_tipo_questao text default null,
  p_formato text default null,
  p_formato_questao text default 'fechadas'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id uuid;
  v_prova_id uuid;
  v_tentativa record;
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  IF public.assinatura_tier() = 'essencial' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
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
    candidatas AS (
      SELECT q.id, coalesce(q.grupo_equivalencia_id, q.id) AS grupo
      FROM public.questao q
      WHERE q.status = 'ativa'
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
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
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
$$;

------------------------------------------------------------------------------
-- 9. get_revisao_prova — expõe recurso_texto/anulada nas questões (2 ramos)
--    (base: 20260707150000)
------------------------------------------------------------------------------

create or replace function public.get_revisao_prova(p_prova_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_tentativa_id uuid;
  v_questoes jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_is_admin := public.is_admin(v_user_id);

  SELECT t.id
  INTO v_tentativa_id
  FROM public.tentativa t
  WHERE t.user_id = v_user_id
    AND t.prova_id = p_prova_id
    AND t.status = 'finalizada'
    AND t.modo <> 'visualizar'
  ORDER BY t.finalizada_em DESC NULLS LAST, t.criado_em DESC
  LIMIT 1;

  IF v_tentativa_id IS NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Revisao disponivel apenas apos finalizar a prova' USING ERRCODE = 'P0005';
  END IF;

  IF v_tentativa_id IS NOT NULL THEN
    -- Questões da tentativa do usuário (cobre provas regulares e personalizadas)
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prova_id', p_prova_id,
        'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
        'codigo_externo', q.codigo_externo,
        'enunciado_apoio', q.enunciado_apoio,
        'enunciado', q.enunciado,
        'imagem_url', q.imagem_url,
        'imagem_legenda', q.imagem_legenda,
        'formato', q.formato,
        'explicacao', q.explicacao,
        'referencia', q.referencia,
        'resposta_modelo', q.resposta_modelo,
        'pontos_chave', coalesce(q.pontos_chave, '[]'::jsonb),
        'recurso_texto', q.recurso_texto,
        'anulada', q.anulada,
        'disciplina', d.sigla,
        'periodo', d.periodo::integer,
        'status', q.status,
        'criado_em', q.criado_em,
        'atualizado_em', q.atualizado_em,
        'alternativas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
            'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url
          ) ORDER BY a.ordem), '[]'::jsonb)
          FROM public.alternativa a WHERE a.questao_id = q.id
        ),
        'temas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
            'disciplina', td.sigla, 'periodo', td.periodo::integer,
            'parent_id', t.parent_id, 'criado_em', t.criado_em
          ) ORDER BY t.nome), '[]'::jsonb)
          FROM public.questao_tema qt
          JOIN public.tema t ON t.id = qt.tema_id
          LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
          WHERE qt.questao_id = q.id
        )
      )
      ORDER BY coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
    )
    INTO v_questoes
    FROM public.tentativa_resposta tr
    JOIN public.questao q ON q.id = tr.questao_id
    LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
    WHERE tr.tentativa_id = v_tentativa_id;
  ELSE
    -- Admin sem tentativa: questões ativas da prova
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prova_id', p_prova_id,
        'ordem_na_prova', pq.ordem,
        'codigo_externo', q.codigo_externo,
        'enunciado_apoio', q.enunciado_apoio,
        'enunciado', q.enunciado,
        'imagem_url', q.imagem_url,
        'imagem_legenda', q.imagem_legenda,
        'formato', q.formato,
        'explicacao', q.explicacao,
        'referencia', q.referencia,
        'resposta_modelo', q.resposta_modelo,
        'pontos_chave', coalesce(q.pontos_chave, '[]'::jsonb),
        'recurso_texto', q.recurso_texto,
        'anulada', q.anulada,
        'disciplina', d.sigla,
        'periodo', d.periodo::integer,
        'status', q.status,
        'criado_em', q.criado_em,
        'atualizado_em', q.atualizado_em,
        'alternativas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
            'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url
          ) ORDER BY a.ordem), '[]'::jsonb)
          FROM public.alternativa a WHERE a.questao_id = q.id
        ),
        'temas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
            'disciplina', td.sigla, 'periodo', td.periodo::integer,
            'parent_id', t.parent_id, 'criado_em', t.criado_em
          ) ORDER BY t.nome), '[]'::jsonb)
          FROM public.questao_tema qt
          JOIN public.tema t ON t.id = qt.tema_id
          LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
          WHERE qt.questao_id = q.id
        )
      )
      ORDER BY pq.ordem, q.id
    )
    INTO v_questoes
    FROM public.prova_questao pq
    JOIN public.questao q ON q.id = pq.questao_id
    LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
    WHERE pq.prova_id = p_prova_id
      AND q.status = 'ativa';
  END IF;

  RETURN jsonb_build_object('questoes', coalesce(v_questoes, '[]'::jsonb));
END;
$$;

------------------------------------------------------------------------------
-- 10. get_historico_kpis — tema mais fraco exclui respostas anuladas
--     (base: 20260707150000; agregado por tentativa já reflete a nota
--     consolidada, que exclui anuladas)
------------------------------------------------------------------------------

create or replace function public.get_historico_kpis()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_user_id                 uuid    := auth.uid();
  v_taxa_acerto             numeric;
  v_total_finalizadas       bigint;
  v_total_questoes          bigint;
  v_tema_mais_fraco         text;
  v_taxa_tema_fraco         numeric;
  v_ultima_nota             numeric;
  v_ultima_nota_data        text;
BEGIN
  SELECT
    CASE
      WHEN sum(coalesce(total_pontuaveis, total_questoes)) > 0
        THEN round(
          sum(coalesce(pontos, acertos::numeric * 100))
            / sum(coalesce(total_pontuaveis, total_questoes)),
          1
        )
      ELSE NULL
    END,
    count(*),
    coalesce(sum(total_questoes), 0)
  INTO v_taxa_acerto, v_total_finalizadas, v_total_questoes
  FROM tentativa
  WHERE user_id = v_user_id
    AND status   = 'finalizada'
    AND modo    != 'visualizar';

  SELECT nota, finalizada_em
  INTO   v_ultima_nota, v_ultima_nota_data
  FROM   tentativa
  WHERE  user_id = v_user_id
    AND  status  = 'finalizada'
    AND  modo   != 'visualizar'
    AND  nota IS NOT NULL
  ORDER  BY finalizada_em DESC
  LIMIT  1;

  -- Tema mais fraco (mín. 3 respostas pontuáveis). Exclui questões anuladas
  -- (admin ou usuário) — coerente com a nota.
  SELECT
    t.nome,
    round(avg(coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100)), 1)
  INTO v_tema_mais_fraco, v_taxa_tema_fraco
  FROM tentativa_resposta tr
  JOIN tentativa    ten ON ten.id        = tr.tentativa_id
  JOIN questao      q   ON q.id          = tr.questao_id
  JOIN questao_tema qt  ON qt.questao_id = tr.questao_id
  JOIN tema         t   ON t.id          = qt.tema_id
  WHERE ten.user_id          = v_user_id
    AND ten.status           = 'finalizada'
    AND ten.modo            != 'visualizar'
    AND NOT (q.anulada OR tr.anulada_usuario)
    AND coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100) IS NOT NULL
  GROUP BY t.id, t.nome
  HAVING count(*) >= 3
  ORDER BY round(avg(coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100)), 1) ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'taxa_acerto',               v_taxa_acerto,
    'total_finalizadas',         v_total_finalizadas,
    'total_questoes_respondidas', v_total_questoes,
    'tema_mais_fraco',           v_tema_mais_fraco,
    'taxa_tema_fraco',           v_taxa_tema_fraco,
    'ultima_nota',               v_ultima_nota,
    'ultima_nota_data',          v_ultima_nota_data
  );
END;
$$;

------------------------------------------------------------------------------
-- 11. get_desempenho_por_tema — exclui respostas anuladas
--     (base: 20260707150000)
------------------------------------------------------------------------------

create or replace function public.get_desempenho_por_tema()
returns table(tema_nome text, total bigint, acertos bigint, taxa numeric)
language plpgsql
stable
set search_path to 'public'
as $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    t.nome::text AS tema_nome,
    count(*)::bigint AS total,
    count(*) FILTER (
      WHERE coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100) >= 70
    )::bigint AS acertos,
    round(
      avg(coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100)),
      1
    ) AS taxa
  FROM tentativa_resposta tr
  JOIN tentativa    ten ON ten.id        = tr.tentativa_id
  JOIN questao      q   ON q.id          = tr.questao_id
  JOIN questao_tema qt  ON qt.questao_id = tr.questao_id
  JOIN tema         t   ON t.id          = qt.tema_id
  WHERE ten.user_id          = v_user_id
    AND ten.status           = 'finalizada'
    AND ten.modo            != 'visualizar'
    AND NOT (q.anulada OR tr.anulada_usuario)
    AND coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100) IS NOT NULL
  GROUP BY t.id, t.nome
  HAVING count(*) >= 3
  ORDER BY taxa ASC;
END;
$$;
