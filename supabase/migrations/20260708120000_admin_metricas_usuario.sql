-- ============================================================
-- RPC de métricas individuais por usuário para o dashboard admin.
--
-- Retorna, para um usuário e um período configurável:
--   * perfil            : dados básicos (nome, email, papel, último login…)
--   * tentativas        : agregados do período (totais, taxa de acerto, tempo,
--                         distribuição por modo e por formato de prova)
--   * serie_tentativas_por_dia : série diária p/ gráfico de atividade
--   * gamificacao       : snapshot atual + XP ganho no período
--   * serie_xp_por_dia  : série diária de XP p/ gráfico
--   * assinatura_atual  : assinatura relevante (ativa ou a mais recente), com
--                         flag de renovação cancelada (carência) e cortesia
--   * assinaturas_historico : todas as assinaturas do usuário
--   * pagamentos        : cobranças do usuário no período (máx. 100)
--
-- Segurança: SECURITY DEFINER + is_admin() na entrada (mesmo padrão de
-- admin_get_financeiro / admin_get_uso_plataforma). Nenhuma policy nova é
-- aberta nas tabelas base — esta RPC é o único canal de leitura cross-user.
-- Os baldes diários usam o fuso de Brasília (America/Sao_Paulo).
-- ============================================================

-- Filtro frequente da RPC: tentativas de um usuário dentro de um intervalo.
CREATE INDEX IF NOT EXISTS idx_tentativa_user_id_iniciada_em
  ON public.tentativa (user_id, iniciada_em);

CREATE OR REPLACE FUNCTION public.admin_get_metricas_usuario(
  p_user_id uuid,
  p_desde   timestamptz DEFAULT NULL,
  p_ate     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result  jsonb;
  v_ate   timestamptz := LEAST(coalesce(p_ate, now()), now());
  v_desde timestamptz := coalesce(p_desde, LEAST(coalesce(p_ate, now()), now()) - interval '30 days');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Limita as séries diárias a 366 dias para conter o custo do generate_series.
  IF v_desde < v_ate - interval '366 days' THEN
    v_desde := v_ate - interval '366 days';
  END IF;
  IF v_desde > v_ate THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('desde', v_desde, 'ate', v_ate),

    'perfil', (
      SELECT jsonb_build_object(
        'id', pr.id,
        'nome_completo', pr.nome_completo,
        'email', pr.email,
        'papel', pr.papel,
        'tipo_usuario', pr.tipo_usuario,
        'criado_em', pr.criado_em,
        'ultimo_login', pr.ultimo_login,
        'banido', pr.banido
      )
      FROM profiles pr WHERE pr.id = p_user_id
    ),

    'tentativas', (
      SELECT jsonb_build_object(
        'total', count(*),
        'finalizadas', count(*) FILTER (WHERE t.status = 'finalizada'),
        'em_andamento', count(*) FILTER (WHERE t.status = 'em_andamento'),
        'acertos', coalesce(sum(t.acertos) FILTER (WHERE t.status = 'finalizada'), 0),
        'nota_media', round(avg(t.nota) FILTER (WHERE t.status = 'finalizada' AND t.nota IS NOT NULL), 1),
        'tempo_total_segundos', coalesce(sum(t.tempo_acumulado_segundos), 0),
        'por_modo', coalesce((
          SELECT jsonb_object_agg(m.modo, m.qtd)
          FROM (
            SELECT t2.modo, count(*) AS qtd
            FROM tentativa t2
            WHERE t2.user_id = p_user_id
              AND t2.iniciada_em >= v_desde AND t2.iniciada_em <= v_ate
            GROUP BY t2.modo
          ) m
        ), '{}'::jsonb),
        'por_formato', coalesce((
          SELECT jsonb_object_agg(coalesce(f.formato, 'outro'), f.qtd)
          FROM (
            SELECT p2.formato, count(*) AS qtd
            FROM tentativa t3
            LEFT JOIN prova p2 ON p2.id = t3.prova_id
            WHERE t3.user_id = p_user_id
              AND t3.iniciada_em >= v_desde AND t3.iniciada_em <= v_ate
            GROUP BY p2.formato
          ) f
        ), '{}'::jsonb)
      )
      FROM tentativa t
      WHERE t.user_id = p_user_id
        AND t.iniciada_em >= v_desde AND t.iniciada_em <= v_ate
    ),

    'serie_tentativas_por_dia', (
      WITH dias AS (
        SELECT generate_series(
          (timezone('America/Sao_Paulo', v_desde))::date,
          (timezone('America/Sao_Paulo', v_ate))::date,
          interval '1 day'
        )::date AS dia
      ),
      agg AS (
        SELECT (timezone('America/Sao_Paulo', t.iniciada_em))::date AS dia,
               count(*) AS quantidade,
               coalesce(sum(t.acertos), 0) AS acertos
        FROM tentativa t
        WHERE t.user_id = p_user_id
          AND t.iniciada_em >= v_desde AND t.iniciada_em <= v_ate
        GROUP BY 1
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'dia', to_char(d.dia, 'YYYY-MM-DD'),
          'quantidade', coalesce(a.quantidade, 0),
          'acertos', coalesce(a.acertos, 0)
        ) ORDER BY d.dia)
      FROM dias d LEFT JOIN agg a USING (dia)
    ),

    'gamificacao', (
      SELECT jsonb_build_object(
        'xp_total', coalesce(s.xp_total, 0),
        'xp_semana_atual', coalesce(s.xp_semana_atual, 0),
        'nivel', coalesce(s.nivel, 0),
        'streak_atual', coalesce(s.streak_atual, 0),
        'streak_recorde', coalesce(s.streak_recorde, 0),
        'freezes_disponiveis', coalesce(s.freezes_disponiveis, 0),
        'xp_no_periodo', coalesce((
          SELECT sum(e.xp) FROM gamificacao_evento e
          WHERE e.user_id = p_user_id
            AND e.criado_em >= v_desde AND e.criado_em <= v_ate
        ), 0)
      )
      FROM (SELECT 1) one
      LEFT JOIN user_gamificacao_stats s ON s.user_id = p_user_id
    ),

    'serie_xp_por_dia', (
      WITH dias AS (
        SELECT generate_series(
          (timezone('America/Sao_Paulo', v_desde))::date,
          (timezone('America/Sao_Paulo', v_ate))::date,
          interval '1 day'
        )::date AS dia
      ),
      agg AS (
        SELECT (timezone('America/Sao_Paulo', e.criado_em))::date AS dia,
               sum(e.xp) AS xp
        FROM gamificacao_evento e
        WHERE e.user_id = p_user_id
          AND e.criado_em >= v_desde AND e.criado_em <= v_ate
        GROUP BY 1
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'dia', to_char(d.dia, 'YYYY-MM-DD'),
          'xp', coalesce(a.xp, 0)
        ) ORDER BY d.dia)
      FROM dias d LEFT JOIN agg a USING (dia)
    ),

    -- Assinatura relevante: a que dá acesso ativo agora (authorized com
    -- próxima cobrança futura/nula, ou cancelled ainda na carência); sem
    -- nenhuma ativa, a mais recente. Espelha tem_assinatura_ativa e a
    -- lógica resumirAssinatura do frontend.
    'assinatura_atual', (
      SELECT jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'plano_nome', pl.nome,
        'plano_slug', pl.slug,
        'preco_centavos', pl.preco_centavos,
        'frequency', pl.frequency,
        'frequency_type', pl.frequency_type,
        'data_inicio', a.data_inicio,
        'proxima_cobranca', a.proxima_cobranca,
        'cancelada_em', a.cancelada_em,
        'cortesia', a.cortesia,
        'ativa', (
          (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
          OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
        ),
        'renovacao_cancelada', (
          a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now()
        )
      )
      FROM assinatura a
      LEFT JOIN plano pl ON pl.id = a.plano_id
      WHERE a.user_id = p_user_id
      ORDER BY
        (
          (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
          OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
        ) DESC,
        a.criado_em DESC
      LIMIT 1
    ),

    'assinaturas_historico', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'status', a.status,
          'plano_nome', pl.nome,
          'plano_slug', pl.slug,
          'data_inicio', a.data_inicio,
          'proxima_cobranca', a.proxima_cobranca,
          'cancelada_em', a.cancelada_em,
          'cortesia', a.cortesia,
          'criado_em', a.criado_em
        ) ORDER BY a.criado_em DESC)
      FROM assinatura a
      LEFT JOIN plano pl ON pl.id = a.plano_id
      WHERE a.user_id = p_user_id
    ), '[]'::jsonb),

    'pagamentos', coalesce((
      SELECT jsonb_agg(pg_row ORDER BY pg_criado_em DESC)
      FROM (
        SELECT pg.criado_em AS pg_criado_em,
               jsonb_build_object(
                 'id', pg.id,
                 'criado_em', pg.criado_em,
                 'processado_em', pg.processado_em,
                 'valor_centavos', pg.valor_centavos,
                 'moeda', pg.moeda,
                 'status', pg.status,
                 'metodo_pagamento', pg.metodo_pagamento
               ) AS pg_row
        FROM pagamento pg
        WHERE pg.user_id = p_user_id
          AND coalesce(pg.processado_em, pg.criado_em) >= v_desde
          AND coalesce(pg.processado_em, pg.criado_em) <= v_ate
        ORDER BY pg.criado_em DESC
        LIMIT 100
      ) sub
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_metricas_usuario(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_metricas_usuario(uuid, timestamptz, timestamptz) TO authenticated;
