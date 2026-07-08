-- ============================================================
-- Métricas de uso/custo da correção por IA (Aurora).
--   1. Coluna custo_usd em resposta_correcao (custo real por chamada, USD).
--      Preenchida pela edge function corrigir-resposta-aberta a partir de
--      usage.cost do OpenRouter. fake = 0; provider sem custo informado = null.
--   2. RPC admin_get_metricas_ia(): volume, tokens e custo por janelas de tempo
--      (hoje / 7d / 30d / total), série diária dos últimos 30 dias e quebra por
--      modelo. SECURITY DEFINER + is_admin(), no padrão de admin_get_financeiro.
-- ============================================================

ALTER TABLE public.resposta_correcao
  ADD COLUMN IF NOT EXISTS custo_usd numeric;

COMMENT ON COLUMN public.resposta_correcao.custo_usd IS
  'Custo real da correção em USD (usage.cost do OpenRouter). null = provider não informou; 0 = fake.';

CREATE OR REPLACE FUNCTION public.admin_get_metricas_ia()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  tz text := 'America/Sao_Paulo';
  inicio_hoje timestamptz := date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz;
  hoje_date date := (now() AT TIME ZONE tz)::date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  WITH c AS (
    SELECT
      criado_em,
      COALESCE(tokens_prompt, 0)   AS tp,
      COALESCE(tokens_resposta, 0) AS tr,
      COALESCE(custo_usd, 0)       AS custo,
      modelo
    FROM resposta_correcao
    WHERE status = 'corrigida'
  ),
  janela AS (
    SELECT
      -- hoje
      count(*) FILTER (WHERE criado_em >= inicio_hoje)                         AS n_hoje,
      COALESCE(sum(tp)    FILTER (WHERE criado_em >= inicio_hoje), 0)          AS tp_hoje,
      COALESCE(sum(tr)    FILTER (WHERE criado_em >= inicio_hoje), 0)          AS tr_hoje,
      COALESCE(sum(custo) FILTER (WHERE criado_em >= inicio_hoje), 0)          AS custo_hoje,
      -- 7 dias
      count(*) FILTER (WHERE criado_em >= now() - interval '7 days')          AS n_7d,
      COALESCE(sum(tp)    FILTER (WHERE criado_em >= now() - interval '7 days'), 0)    AS tp_7d,
      COALESCE(sum(tr)    FILTER (WHERE criado_em >= now() - interval '7 days'), 0)    AS tr_7d,
      COALESCE(sum(custo) FILTER (WHERE criado_em >= now() - interval '7 days'), 0)    AS custo_7d,
      -- 30 dias
      count(*) FILTER (WHERE criado_em >= now() - interval '30 days')         AS n_30d,
      COALESCE(sum(tp)    FILTER (WHERE criado_em >= now() - interval '30 days'), 0)   AS tp_30d,
      COALESCE(sum(tr)    FILTER (WHERE criado_em >= now() - interval '30 days'), 0)   AS tr_30d,
      COALESCE(sum(custo) FILTER (WHERE criado_em >= now() - interval '30 days'), 0)   AS custo_30d,
      -- total
      count(*)              AS n_total,
      COALESCE(sum(tp), 0)  AS tp_total,
      COALESCE(sum(tr), 0)  AS tr_total,
      COALESCE(sum(custo), 0) AS custo_total
    FROM c
  ),
  serie AS (
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'dia', to_char(d.dia, 'YYYY-MM-DD'),
               'correcoes', COALESCE(s.n, 0),
               'tokens_total', COALESCE(s.tokens, 0),
               'custo_usd', COALESCE(s.custo, 0)
             ) ORDER BY d.dia
           ), '[]'::jsonb) AS serie_diaria
    FROM generate_series(hoje_date - 29, hoje_date, interval '1 day') AS d(dia)
    LEFT JOIN (
      SELECT (criado_em AT TIME ZONE tz)::date AS dia,
             count(*) AS n, sum(tp + tr) AS tokens, sum(custo) AS custo
      FROM c
      GROUP BY 1
    ) s ON s.dia = d.dia::date
  ),
  modelos AS (
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'modelo', COALESCE(m.modelo, '(desconhecido)'),
               'correcoes', m.n,
               'tokens_total', m.tokens,
               'custo_usd', m.custo
             ) ORDER BY m.custo DESC NULLS LAST
           ), '[]'::jsonb) AS por_modelo
    FROM (
      SELECT modelo, count(*) AS n, sum(tp + tr) AS tokens, sum(custo) AS custo
      FROM c
      GROUP BY modelo
    ) m
  )
  SELECT jsonb_build_object(
    'janelas', jsonb_build_object(
      'hoje',  jsonb_build_object('correcoes', j.n_hoje,  'tokens_prompt', j.tp_hoje,  'tokens_resposta', j.tr_hoje,  'tokens_total', j.tp_hoje + j.tr_hoje,   'custo_usd', j.custo_hoje),
      'd7',    jsonb_build_object('correcoes', j.n_7d,    'tokens_prompt', j.tp_7d,    'tokens_resposta', j.tr_7d,    'tokens_total', j.tp_7d + j.tr_7d,       'custo_usd', j.custo_7d),
      'd30',   jsonb_build_object('correcoes', j.n_30d,   'tokens_prompt', j.tp_30d,   'tokens_resposta', j.tr_30d,   'tokens_total', j.tp_30d + j.tr_30d,     'custo_usd', j.custo_30d),
      'total', jsonb_build_object('correcoes', j.n_total, 'tokens_prompt', j.tp_total, 'tokens_resposta', j.tr_total, 'tokens_total', j.tp_total + j.tr_total, 'custo_usd', j.custo_total)
    ),
    'serie_diaria', (SELECT serie_diaria FROM serie),
    'por_modelo', (SELECT por_modelo FROM modelos),
    'falhas', jsonb_build_object(
      'erro',   (SELECT count(*) FROM resposta_correcao WHERE status = 'erro'),
      'sem_ia', (SELECT count(*) FROM resposta_correcao WHERE status = 'sem_ia')
    )
  )
  INTO result
  FROM janela j;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_metricas_ia() IS
  'Métricas de uso/custo da correção por IA para o admin (janelas, série diária, por modelo). Admin-only.';
