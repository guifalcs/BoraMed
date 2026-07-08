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
--
-- Performance: cada tabela é lida uma única vez em CTEs compartilhados
-- (tent, xp_eventos, assinaturas); os agregados derivam desses CTEs.
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

  WITH
  -- Tentativas do período: lida UMA vez (com o formato da prova já anexado);
  -- todos os agregados de tentativa derivam deste CTE.
  tent AS (
    SELECT t.modo, t.status, t.acertos, t.nota, t.tempo_acumulado_segundos,
           p2.formato AS prova_formato,
           (timezone('America/Sao_Paulo', t.iniciada_em))::date AS dia
    FROM tentativa t
    LEFT JOIN prova p2 ON p2.id = t.prova_id
    WHERE t.user_id = p_user_id
      AND t.iniciada_em >= v_desde AND t.iniciada_em <= v_ate
  ),
  -- Eventos de XP do período: lidos UMA vez; total do período = soma da série.
  xp_dia AS (
    SELECT (timezone('America/Sao_Paulo', e.criado_em))::date AS dia,
           sum(e.xp) AS xp
    FROM gamificacao_evento e
    WHERE e.user_id = p_user_id
      AND e.criado_em >= v_desde AND e.criado_em <= v_ate
    GROUP BY 1
  ),
  dias AS (
    SELECT generate_series(
      (timezone('America/Sao_Paulo', v_desde))::date,
      (timezone('America/Sao_Paulo', v_ate))::date,
      interval '1 day'
    )::date AS dia
  ),
  -- Assinaturas do usuário: lidas UMA vez, com a regra de "dá acesso ativo
  -- agora" computada num único lugar (espelha tem_assinatura_ativa e a
  -- lógica resumirAssinatura do frontend). assinatura_atual = primeira linha
  -- na ordem (ativa primeiro, depois mais recente); historico = todas.
  assinaturas AS (
    SELECT a.id, a.status, a.data_inicio, a.proxima_cobranca, a.cancelada_em,
           a.cortesia, a.criado_em,
           pl.nome AS plano_nome, pl.slug AS plano_slug,
           pl.preco_centavos, pl.frequency, pl.frequency_type,
           (
             (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
             OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
           ) AS ativa
    FROM assinatura a
    LEFT JOIN plano pl ON pl.id = a.plano_id
    WHERE a.user_id = p_user_id
  )
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
        'finalizadas', count(*) FILTER (WHERE status = 'finalizada'),
        'em_andamento', count(*) FILTER (WHERE status = 'em_andamento'),
        'acertos', coalesce(sum(acertos) FILTER (WHERE status = 'finalizada'), 0),
        'nota_media', round(avg(nota) FILTER (WHERE status = 'finalizada' AND nota IS NOT NULL), 1),
        'tempo_total_segundos', coalesce(sum(tempo_acumulado_segundos), 0),
        'por_modo', coalesce((
          SELECT jsonb_object_agg(m.modo, m.qtd)
          FROM (SELECT modo, count(*) AS qtd FROM tent GROUP BY modo) m
        ), '{}'::jsonb),
        'por_formato', coalesce((
          SELECT jsonb_object_agg(coalesce(f.prova_formato, 'outro'), f.qtd)
          FROM (SELECT prova_formato, count(*) AS qtd FROM tent GROUP BY prova_formato) f
        ), '{}'::jsonb)
      )
      FROM tent
    ),

    'serie_tentativas_por_dia', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dia', to_char(d.dia, 'YYYY-MM-DD'),
          'quantidade', coalesce(a.quantidade, 0)
        ) ORDER BY d.dia)
      FROM dias d
      LEFT JOIN (SELECT dia, count(*) AS quantidade FROM tent GROUP BY dia) a USING (dia)
    ),

    'gamificacao', (
      SELECT jsonb_build_object(
        'xp_total', coalesce(s.xp_total, 0),
        'xp_semana_atual', coalesce(s.xp_semana_atual, 0),
        'nivel', coalesce(s.nivel, 0),
        'streak_atual', coalesce(s.streak_atual, 0),
        'streak_recorde', coalesce(s.streak_recorde, 0),
        'freezes_disponiveis', coalesce(s.freezes_disponiveis, 0),
        'xp_no_periodo', coalesce((SELECT sum(xp) FROM xp_dia), 0)
      )
      FROM (SELECT 1) one
      LEFT JOIN user_gamificacao_stats s ON s.user_id = p_user_id
    ),

    'serie_xp_por_dia', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dia', to_char(d.dia, 'YYYY-MM-DD'),
          'xp', coalesce(x.xp, 0)
        ) ORDER BY d.dia)
      FROM dias d LEFT JOIN xp_dia x USING (dia)
    ),

    'assinatura_atual', (
      SELECT jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'plano_nome', a.plano_nome,
        'plano_slug', a.plano_slug,
        'preco_centavos', a.preco_centavos,
        'frequency', a.frequency,
        'frequency_type', a.frequency_type,
        'data_inicio', a.data_inicio,
        'proxima_cobranca', a.proxima_cobranca,
        'cancelada_em', a.cancelada_em,
        'cortesia', a.cortesia,
        'ativa', a.ativa,
        -- cancelou a renovação mas segue com acesso (carência)
        'renovacao_cancelada', (a.status = 'cancelled' AND a.ativa)
      )
      FROM assinaturas a
      ORDER BY a.ativa DESC, a.criado_em DESC
      LIMIT 1
    ),

    'assinaturas_historico', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'status', a.status,
          'plano_nome', a.plano_nome,
          'plano_slug', a.plano_slug,
          'data_inicio', a.data_inicio,
          'proxima_cobranca', a.proxima_cobranca,
          'cancelada_em', a.cancelada_em,
          'cortesia', a.cortesia,
          'criado_em', a.criado_em
        ) ORDER BY a.criado_em DESC)
      FROM assinaturas a
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
