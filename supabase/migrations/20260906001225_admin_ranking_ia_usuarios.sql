-- ============================================================
-- Consumo de IA por usuário (quem mais usa a Aurora).
--
-- admin_get_metricas_ia() já dá o agregado (janelas, série, modelo). Faltava a
-- quebra por pessoa: quem dispara mais correções, queima mais tokens e custa
-- mais em USD. Fonte é a mesma (resposta_correcao), atribuída ao aluno pela
-- cadeia resposta_correcao → tentativa_resposta → tentativa.user_id.
--
-- SECURITY DEFINER + is_admin(), no padrão de admin_get_uso_usuarios_dia.
-- p_dias = 0 → sem recorte de período (total histórico).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_ranking_ia_usuarios(
  p_dias integer DEFAULT 30,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  tz text := 'America/Sao_Paulo';
  v_dias integer := least(greatest(coalesce(p_dias, 30), 0), 3650);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_desde timestamptz := CASE WHEN v_dias = 0 THEN NULL ELSE now() - make_interval(days => v_dias) END;
  inicio_hoje timestamptz := date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  WITH base AS (
    SELECT
      t.user_id,
      rc.status,
      rc.criado_em,
      COALESCE(rc.tokens_prompt, 0)   AS tp,
      COALESCE(rc.tokens_resposta, 0) AS tr,
      COALESCE(rc.custo_usd, 0)       AS custo
    FROM public.resposta_correcao rc
    JOIN public.tentativa_resposta tresp ON tresp.id = rc.tentativa_resposta_id
    JOIN public.tentativa t ON t.id = tresp.tentativa_id
    WHERE (v_desde IS NULL OR rc.criado_em >= v_desde)
  ),
  agg AS (
    SELECT
      user_id,
      count(*) FILTER (WHERE status = 'corrigida')                              AS correcoes,
      count(*) FILTER (WHERE status = 'erro')                                   AS erros,
      count(*) FILTER (WHERE status = 'sem_ia')                                 AS sem_ia,
      COALESCE(sum(tp)    FILTER (WHERE status = 'corrigida'), 0)               AS tokens_prompt,
      COALESCE(sum(tr)    FILTER (WHERE status = 'corrigida'), 0)               AS tokens_resposta,
      COALESCE(sum(custo) FILTER (WHERE status = 'corrigida'), 0)               AS custo_usd,
      count(*) FILTER (WHERE criado_em >= inicio_hoje AND status = 'corrigida') AS correcoes_hoje,
      min(criado_em) AS primeira_em,
      max(criado_em) AS ultima_em
    FROM base
    GROUP BY user_id
  ),
  visiveis AS (
    SELECT * FROM agg WHERE correcoes > 0 OR erros > 0
  )
  SELECT jsonb_build_object(
    'dias', v_dias,
    'total_usuarios',  (SELECT count(*) FROM visiveis),
    'total_correcoes', (SELECT COALESCE(sum(correcoes), 0) FROM visiveis),
    'total_tokens',    (SELECT COALESCE(sum(tokens_prompt + tokens_resposta), 0) FROM visiveis),
    'total_custo_usd', (SELECT COALESCE(sum(custo_usd), 0) FROM visiveis),
    'usuarios', COALESCE((
      SELECT jsonb_agg(u ORDER BY (u->>'custo_usd')::numeric DESC, (u->>'correcoes')::bigint DESC)
      FROM (
        SELECT jsonb_build_object(
                 'user_id', a.user_id,
                 'nome', COALESCE(p.nome_completo, split_part(p.email, '@', 1), 'Usuário removido'),
                 'email', p.email,
                 'avatar_url', p.avatar_url,
                 'tipo_usuario', p.tipo_usuario,
                 'correcoes', a.correcoes,
                 'erros', a.erros,
                 'sem_ia', a.sem_ia,
                 'tokens_prompt', a.tokens_prompt,
                 'tokens_resposta', a.tokens_resposta,
                 'tokens_total', a.tokens_prompt + a.tokens_resposta,
                 'custo_usd', a.custo_usd,
                 'correcoes_hoje', a.correcoes_hoje,
                 'primeira_em', a.primeira_em,
                 'ultima_em', a.ultima_em
               ) AS u
        FROM visiveis a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        ORDER BY a.custo_usd DESC, a.correcoes DESC, a.user_id
        LIMIT v_limit
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_ranking_ia_usuarios(integer, integer) IS
  'Ranking de consumo de IA por usuário (correções, tokens e custo USD) numa janela de dias. p_dias = 0 → total. Admin-only.';

REVOKE EXECUTE ON FUNCTION public.admin_get_ranking_ia_usuarios(integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_get_ranking_ia_usuarios(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ranking_ia_usuarios(integer, integer) TO authenticated;

-- Atribuição por usuário faz um scan em resposta_correcao filtrando por data.
CREATE INDEX IF NOT EXISTS resposta_correcao_criado_em_idx
  ON public.resposta_correcao (criado_em DESC);
