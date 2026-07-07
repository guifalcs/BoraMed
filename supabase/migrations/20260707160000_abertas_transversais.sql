-- ============================================================================
-- Questões abertas — Fase 7: transversais (XP, desafio diário, impressão).
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

-- 1. conceder_xp_tentativa — XP base por pontos (tentativas antigas: acertos)

CREATE OR REPLACE FUNCTION public.conceder_xp_tentativa(p_tentativa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id          uuid;
  v_tentativa        public.tentativa%rowtype;
  v_idempotency_key  text;
  v_base             integer;
  v_bonus_nota       integer;
  v_bonus_tempo      integer;
  v_xp_calculado     integer;
  v_xp_hoje          integer;
  v_xp_concedido     integer;
  v_tempo_medio      numeric;
  v_stats            jsonb;
  v_novas_conquistas jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada' USING ERRCODE = 'P0003';
  END IF;

  v_idempotency_key := 'tentativa:' || p_tentativa_id::text;

  IF EXISTS (
    SELECT 1 FROM public.gamificacao_evento
    WHERE user_id = v_user_id AND idempotency_key = v_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'xp_ganho', 0,
      'ja_concedido', true,
      'novas_conquistas', public.verificar_conquistas_usuario(v_user_id),
      'stats', public.get_meu_xp()
    );
  END IF;

  IF v_tentativa.status <> 'finalizada' OR v_tentativa.modo = 'visualizar' THEN
    RETURN jsonb_build_object(
      'xp_ganho', 0,
      'ja_concedido', false,
      'novas_conquistas', '[]'::jsonb,
      'stats', public.get_meu_xp()
    );
  END IF;

  -- XP base: 10 pts por acerto — em tentativas com discursivas usa os pontos
  -- consolidados (coalesce canônico): 10 XP por 100 pontos.
  v_base := GREATEST(round(COALESCE(v_tentativa.pontos, COALESCE(v_tentativa.acertos, 0) * 100)::numeric / 10), 0)::integer;

  -- Bônus por nota
  v_bonus_nota := CASE
    WHEN COALESCE(v_tentativa.nota, 0) >= 70 THEN 50
    WHEN COALESCE(v_tentativa.nota, 0) >= 50 THEN 20
    ELSE 0
  END;

  -- Bônus por tempo (dificuldade removida — coluna não existe mais)
  v_tempo_medio := CASE
    WHEN COALESCE(v_tentativa.total_respondidas, 0) > 0
    THEN v_tentativa.tempo_acumulado_segundos::numeric / v_tentativa.total_respondidas
    ELSE NULL
  END;
  v_bonus_tempo := CASE
    WHEN v_tempo_medio IS NOT NULL
      AND v_tempo_medio < 60
      AND COALESCE(v_tentativa.nota, 0) >= 50
    THEN 15
    ELSE 0
  END;

  v_xp_calculado := v_base + v_bonus_nota + v_bonus_tempo;

  -- Cap diário de 500 XP por tentativas
  SELECT COALESCE(SUM(xp), 0)::integer
  INTO v_xp_hoje
  FROM public.gamificacao_evento
  WHERE user_id = v_user_id
    AND tipo = 'tentativa'
    AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
        = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_xp_concedido := LEAST(v_xp_calculado, GREATEST(500 - v_xp_hoje, 0));

  INSERT INTO public.gamificacao_evento (user_id, tipo, xp, metadata, idempotency_key)
  VALUES (
    v_user_id, 'tentativa', v_xp_concedido,
    jsonb_build_object(
      'tentativa_id', p_tentativa_id,
      'xp_calculado', v_xp_calculado,
      'base',         v_base,
      'bonus_nota',   v_bonus_nota,
      'bonus_tempo',  v_bonus_tempo
    ),
    v_idempotency_key
  );

  v_novas_conquistas := public.verificar_conquistas_usuario(v_user_id);
  v_stats            := public.get_meu_xp();

  RETURN jsonb_build_object(
    'xp_ganho',         v_xp_concedido,
    'ja_concedido',     false,
    'novas_conquistas', v_novas_conquistas,
    'stats',            v_stats
  );
END;
$function$;

-- 2. get_desafio_diario — exclui discursivas (D14)

CREATE OR REPLACE FUNCTION public.get_desafio_diario()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_hoje date;
  v_questao_id uuid;
  v_resposta public.desafio_diario_resposta%rowtype;
  v_total integer;
  v_acertos integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.desafio_diario (data, questao_id)
  SELECT v_hoje, q.id
  FROM public.questao q
  LEFT JOIN public.desafio_diario dd ON dd.questao_id = q.id
  WHERE q.apto_desafio_diario = true
    -- D14: discursivas fora do desafio diário (fluxo síncrono não combina
    -- com latência/custo de correção por IA)
    AND q.formato <> 'resposta_aberta_curta'
  ORDER BY dd.data ASC NULLS FIRST, random()
  LIMIT 1
  ON CONFLICT (data) DO NOTHING;

  SELECT questao_id
  INTO v_questao_id
  FROM public.desafio_diario
  WHERE data = v_hoje;

  IF v_questao_id IS NULL THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'mensagem', 'Nenhuma questao disponivel para o desafio de hoje.'
    );
  END IF;

  SELECT *
  INTO v_resposta
  FROM public.desafio_diario_resposta
  WHERE user_id = v_user_id
    AND data = v_hoje;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE correta = true)::integer
  INTO v_total, v_acertos
  FROM public.desafio_diario_resposta
  WHERE data = v_hoje;

  IF found AND v_resposta.user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'disponivel', true,
      'data', v_hoje,
      'questao', (
        SELECT jsonb_build_object(
          'id', q.id,
          'enunciado', q.enunciado,
          'enunciado_apoio', q.enunciado_apoio,
          'imagem_url', q.imagem_url,
          'imagem_legenda', q.imagem_legenda,
          'disciplina', d.sigla,
          'explicacao', q.explicacao
        )
        FROM public.questao q
        LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
        WHERE q.id = v_questao_id
      ),
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'letra', a.letra,
          'texto', a.texto,
          'ordem', a.ordem,
          'correta', a.correta
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = v_questao_id
      ),
      'minha_resposta', jsonb_build_object(
        'alternativa_id', v_resposta.alternativa_id,
        'correta', v_resposta.correta,
        'xp_ganho', v_resposta.xp_ganho,
        'respondido_em', v_resposta.respondido_em
      ),
      'estatistica', jsonb_build_object(
        'total_responderam', v_total,
        'percentual_acerto', CASE
          WHEN v_total > 0 THEN round((v_acertos::numeric / v_total) * 100)::integer
          ELSE 0
        END
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'disponivel', true,
    'data', v_hoje,
    'questao', (
      SELECT jsonb_build_object(
        'id', q.id,
        'enunciado', q.enunciado,
        'enunciado_apoio', q.enunciado_apoio,
        'imagem_url', q.imagem_url,
        'imagem_legenda', q.imagem_legenda,
        'disciplina', d.sigla
      )
      FROM public.questao q
      LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
      WHERE q.id = v_questao_id
    ),
    'alternativas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'letra', a.letra,
        'texto', a.texto,
        'ordem', a.ordem
      ) ORDER BY a.ordem), '[]'::jsonb)
      FROM public.alternativa a
      WHERE a.questao_id = v_questao_id
    ),
    'minha_resposta', null,
    'estatistica', jsonb_build_object(
      'total_responderam', v_total,
      'percentual_acerto', CASE
        WHEN v_total > 0 THEN round((v_acertos::numeric / v_total) * 100)::integer
        ELSE 0
      END
    )
  );
END;
$function$;

-- get_simulado_impressao — inclui gabarito aberto quando o gabarito está liberado

CREATE OR REPLACE FUNCTION public.get_simulado_impressao(p_prova_id uuid, p_com_gabarito boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_liberado boolean;
  v_com_gab boolean;
  v_tem_junction boolean;
  v_tentativa_id uuid;
  v_prova record;
  v_questoes jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
  END IF;

  v_is_admin := public.is_admin(v_user_id);

  SELECT p.id, p.nome, p.qtd_questoes, p.periodo, p.formato
  INTO v_prova
  FROM public.prova p
  WHERE p.id = p_prova_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova nao encontrada' USING ERRCODE = 'P0003';
  END IF;

  -- Gabarito liberado: já finalizou uma tentativa real desta prova, ou é admin.
  v_liberado := v_is_admin OR EXISTS (
    SELECT 1
    FROM public.tentativa t
    WHERE t.user_id = v_user_id
      AND t.prova_id = p_prova_id
      AND t.status = 'finalizada'
      AND t.modo <> 'visualizar'
  );

  v_com_gab := COALESCE(p_com_gabarito, false) AND v_liberado;

  v_tem_junction := EXISTS (
    SELECT 1 FROM public.prova_questao pq WHERE pq.prova_id = p_prova_id
  );

  IF v_tem_junction THEN
    -- Prova pronta: questões ativas ordenadas pela junção.
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
        'resposta_modelo', CASE WHEN v_com_gab THEN q.resposta_modelo END,
        'pontos_chave', CASE WHEN v_com_gab THEN coalesce(q.pontos_chave, '[]'::jsonb) ELSE '[]'::jsonb END,
        'tipo_questao', q.tipo_questao,
        'explicacao', CASE WHEN v_com_gab THEN q.explicacao ELSE NULL END,
        'referencia', CASE WHEN v_com_gab THEN q.referencia ELSE NULL END,
        'disciplina', d.sigla,
        'periodo', d.periodo::integer,
        'status', q.status,
        'criado_em', q.criado_em,
        'atualizado_em', q.atualizado_em,
        'alternativas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
            'texto', a.texto,
            'correta', CASE WHEN v_com_gab THEN a.correta ELSE NULL END,
            'ordem', a.ordem, 'imagem_url', a.imagem_url
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
  ELSE
    -- Simulado montado (sem junção): tentativa mais recente do usuário.
    SELECT t.id
    INTO v_tentativa_id
    FROM public.tentativa t
    WHERE t.user_id = v_user_id
      AND t.prova_id = p_prova_id
      AND t.modo <> 'visualizar'
    ORDER BY t.criado_em DESC
    LIMIT 1;

    IF v_tentativa_id IS NOT NULL THEN
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
        'resposta_modelo', CASE WHEN v_com_gab THEN q.resposta_modelo END,
        'pontos_chave', CASE WHEN v_com_gab THEN coalesce(q.pontos_chave, '[]'::jsonb) ELSE '[]'::jsonb END,
          'tipo_questao', q.tipo_questao,
          'explicacao', CASE WHEN v_com_gab THEN q.explicacao ELSE NULL END,
          'referencia', CASE WHEN v_com_gab THEN q.referencia ELSE NULL END,
          'disciplina', d.sigla,
          'periodo', d.periodo::integer,
          'status', q.status,
          'criado_em', q.criado_em,
          'atualizado_em', q.atualizado_em,
          'alternativas', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
              'texto', a.texto,
              'correta', CASE WHEN v_com_gab THEN a.correta ELSE NULL END,
              'ordem', a.ordem, 'imagem_url', a.imagem_url
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
        ORDER BY coalesce(tr.ordem_na_tentativa, 2147483647), tr.id
      )
      INTO v_questoes
      FROM public.tentativa_resposta tr
      JOIN public.questao q ON q.id = tr.questao_id
      LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
      WHERE tr.tentativa_id = v_tentativa_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'prova', jsonb_build_object(
      'id', v_prova.id,
      'nome', v_prova.nome,
      'qtd_questoes', v_prova.qtd_questoes,
      'periodo', v_prova.periodo,
      'formato', v_prova.formato
    ),
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'gabarito_liberado', v_liberado
  );
END;
$function$;

-- gerar_simulado_impressao — inclui gabarito aberto quando o gabarito está liberado

CREATE OR REPLACE FUNCTION public.gerar_simulado_impressao(p_tema_ids uuid[] DEFAULT NULL::uuid[], p_qtd integer DEFAULT 10, p_tipo_questao text DEFAULT NULL::text, p_formato text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.tem_assinatura_ativa() THEN
    RAISE EXCEPTION 'subscription_required: assinatura ativa necessaria' USING ERRCODE = 'P0009';
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

  -- Mesma seleção da geração normal (prioriza questões ainda não entregues).
  SELECT array(
    WITH questoes_entregues AS (
      SELECT DISTINCT tr.questao_id
      FROM public.tentativa t
      JOIN public.tentativa_resposta tr ON tr.tentativa_id = t.id
      WHERE t.user_id = v_user_id
        AND t.modo <> 'visualizar'
    )
    SELECT q.id
    FROM public.questao q
    LEFT JOIN questoes_entregues qe ON qe.questao_id = q.id
    WHERE q.status = 'ativa'
      AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
      AND (p_tipo_questao IS DISTINCT FROM 'laboratorio' OR q.imagem_url IS NOT NULL)
      AND (
        p_formato IS NULL
        OR p_formato = 'laboratorio'
        OR q.formato_prova IS NULL
        OR q.formato_prova = p_formato
        OR (q.formato_prova IN ('N1', 'N2', 'teste_progresso') AND p_formato = 'nacional')
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
    ORDER BY (qe.questao_id IS NOT NULL) ASC, random()
    LIMIT p_qtd
  )
  INTO v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := CASE
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
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

  -- Monta as questões SEM gabarito (correta/explicacao nulos).
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', NULL,
      'ordem_na_prova', selected.ordem::integer,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'resposta_modelo', NULL,
      'pontos_chave', '[]'::jsonb,
      'tipo_questao', q.tipo_questao,
      'explicacao', NULL,
      'referencia', NULL,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
          'texto', a.texto, 'correta', NULL, 'ordem', a.ordem, 'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
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
    ORDER BY selected.ordem
  )
  INTO v_questoes
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem)
  JOIN public.questao q ON q.id = selected.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id;

  RETURN jsonb_build_object(
    'nome', v_nome,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$;
