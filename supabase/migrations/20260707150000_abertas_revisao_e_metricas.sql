-- ============================================================================
-- Questões abertas — Fase 5: revisão, histórico e métricas por pontos.
--
-- Expressão canônica por resposta (D4): coalesce(tr.pontos::numeric,
-- (tr.correta)::int::numeric * 100) — MC 0/100, aberta 0–100 da IA; NULL =
-- não pontuável (sem_ia ou não corrigida) e sai das agregações naturalmente.
-- Nível tentativa: coalesce(t.pontos, t.acertos*100) /
-- coalesce(t.total_pontuaveis, t.total_questoes).
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

------------------------------------------------------------------------------
-- 1. get_revisao_tentativa — delega ao montar_resultado_tentativa (Fase 3),
--    que já inclui resposta_modelo/pontos_chave nas questões e a correção
--    dentro de cada resposta. Mesma classe de exposição pós-finalização.
------------------------------------------------------------------------------

create or replace function public.get_revisao_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_tentativa public.tentativa;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  v_is_admin := public.is_admin(v_user_id);

  select t.* into v_tentativa
  from public.tentativa t
  where t.id = p_tentativa_id
    and (t.user_id = v_user_id or v_is_admin);

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status <> 'finalizada' and not v_is_admin then
    raise exception 'Revisao disponivel apenas apos finalizar a tentativa' using errcode = 'P0005';
  end if;

  return public.montar_resultado_tentativa(p_tentativa_id);
end;
$$;

------------------------------------------------------------------------------
-- 2. get_revisao_prova — inclui o gabarito aberto nas questões (pós-
--    finalização; mesma classe de exposição de `explicacao`).
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
-- 3. get_historico_kpis — agregações binárias → pontos (coalesce canônico)
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
  -- Aproveitamento geral por pontos (tentativas antigas: acertos*100/total)
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

  -- Última nota
  SELECT nota, finalizada_em
  INTO   v_ultima_nota, v_ultima_nota_data
  FROM   tentativa
  WHERE  user_id = v_user_id
    AND  status  = 'finalizada'
    AND  modo   != 'visualizar'
    AND  nota IS NOT NULL
  ORDER  BY finalizada_em DESC
  LIMIT  1;

  -- Tema mais fraco (mín. 3 respostas pontuáveis naquele tema).
  -- coalesce(pontos, correta*100) inclui abertas corrigidas e exclui
  -- sem_ia/não corrigidas (NULL) — antes o filtro era alternativa_id IS NOT NULL.
  SELECT
    t.nome,
    round(avg(coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100)), 1)
  INTO v_tema_mais_fraco, v_taxa_tema_fraco
  FROM tentativa_resposta tr
  JOIN tentativa    ten ON ten.id        = tr.tentativa_id
  JOIN questao_tema qt  ON qt.questao_id = tr.questao_id
  JOIN tema         t   ON t.id          = qt.tema_id
  WHERE ten.user_id          = v_user_id
    AND ten.status           = 'finalizada'
    AND ten.modo            != 'visualizar'
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
-- 4. get_desempenho_por_tema — acertos = respostas com >= 70; taxa = média
--    dos pontos (aproveitamento). Contrato (colunas) inalterado.
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
  JOIN questao_tema qt  ON qt.questao_id = tr.questao_id
  JOIN tema         t   ON t.id          = qt.tema_id
  WHERE ten.user_id          = v_user_id
    AND ten.status           = 'finalizada'
    AND ten.modo            != 'visualizar'
    AND coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100) IS NOT NULL
  GROUP BY t.id, t.nome
  HAVING count(*) >= 3
  ORDER BY taxa ASC;
END;
$$;
