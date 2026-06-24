-- ============================================================
-- RPC de uso/pico da plataforma para o dashboard admin.
--
-- Retorna duas séries para alimentar gráficos:
--   * por_dia  : últimos 14 dias (tendência) com usuários ativos e interações
--   * por_hora : 0h–23h agregando os últimos 30 dias (horário de pico)
-- além de totais do período de 14 dias.
--
-- "Interação" = simulado iniciado (tentativa.iniciada_em) + questão
-- respondida (tentativa_resposta.respondida_em). "Usuário ativo" = usuário
-- distinto com ao menos uma interação no balde (dia/hora).
--
-- Os baldes usam o fuso de Brasília (America/Sao_Paulo) para bater com a
-- expectativa do admin.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_uso_plataforma()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  WITH eventos AS (
    SELECT user_id, iniciada_em AS ts
    FROM public.tentativa
    WHERE iniciada_em IS NOT NULL
    UNION ALL
    SELECT t.user_id, tr.respondida_em AS ts
    FROM public.tentativa_resposta tr
    JOIN public.tentativa t ON t.id = tr.tentativa_id
    WHERE tr.respondida_em IS NOT NULL
  ),
  dias AS (
    SELECT generate_series(
      (timezone('America/Sao_Paulo', now()))::date - 13,
      (timezone('America/Sao_Paulo', now()))::date,
      interval '1 day'
    )::date AS dia
  ),
  agg_dia AS (
    SELECT (timezone('America/Sao_Paulo', ts))::date AS dia,
           count(*) AS interacoes,
           count(DISTINCT user_id) AS usuarios_ativos
    FROM eventos
    WHERE (timezone('America/Sao_Paulo', ts))::date >= (timezone('America/Sao_Paulo', now()))::date - 13
    GROUP BY 1
  ),
  horas AS ( SELECT generate_series(0, 23) AS hora ),
  agg_hora AS (
    SELECT extract(hour FROM timezone('America/Sao_Paulo', ts))::int AS hora,
           count(*) AS interacoes,
           count(DISTINCT user_id) AS usuarios_ativos
    FROM eventos
    WHERE (timezone('America/Sao_Paulo', ts))::date >= (timezone('America/Sao_Paulo', now()))::date - 29
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'por_dia', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dia', to_char(d.dia, 'YYYY-MM-DD'),
          'usuarios_ativos', coalesce(a.usuarios_ativos, 0),
          'interacoes', coalesce(a.interacoes, 0)
        ) ORDER BY d.dia)
      FROM dias d LEFT JOIN agg_dia a USING (dia)
    ),
    'por_hora', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'hora', h.hora,
          'usuarios_ativos', coalesce(a.usuarios_ativos, 0),
          'interacoes', coalesce(a.interacoes, 0)
        ) ORDER BY h.hora)
      FROM horas h LEFT JOIN agg_hora a USING (hora)
    ),
    'usuarios_ativos_14d', (
      SELECT count(DISTINCT user_id) FROM eventos
      WHERE (timezone('America/Sao_Paulo', ts))::date >= (timezone('America/Sao_Paulo', now()))::date - 13
    ),
    'interacoes_14d', (
      SELECT count(*) FROM eventos
      WHERE (timezone('America/Sao_Paulo', ts))::date >= (timezone('America/Sao_Paulo', now()))::date - 13
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_uso_plataforma() FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_get_uso_plataforma() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_uso_plataforma() TO authenticated;
