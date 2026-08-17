-- ============================================================
-- Drill-down do gráfico "Pico de uso" do dashboard admin.
--
-- Dado um dia (fuso America/Sao_Paulo), lista os usuários que interagiram
-- naquele dia, com a contagem de interações. Mesma definição de "interação"
-- usada em admin_get_uso_plataforma(): simulado iniciado (tentativa.iniciada_em)
-- + questão respondida (tentativa_resposta.respondida_em).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_uso_usuarios_dia(
  p_dia date,
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
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_dia IS NULL THEN
    RAISE EXCEPTION 'dia_obrigatorio';
  END IF;

  WITH eventos AS (
    SELECT user_id, iniciada_em AS ts, 'tentativa'::text AS tipo
    FROM public.tentativa
    WHERE iniciada_em IS NOT NULL
      AND (timezone('America/Sao_Paulo', iniciada_em))::date = p_dia
    UNION ALL
    SELECT t.user_id, tr.respondida_em AS ts, 'resposta'::text AS tipo
    FROM public.tentativa_resposta tr
    JOIN public.tentativa t ON t.id = tr.tentativa_id
    WHERE tr.respondida_em IS NOT NULL
      AND (timezone('America/Sao_Paulo', tr.respondida_em))::date = p_dia
  ),
  agg AS (
    SELECT user_id,
           count(*) AS interacoes,
           count(*) FILTER (WHERE tipo = 'tentativa') AS tentativas,
           count(*) FILTER (WHERE tipo = 'resposta') AS respostas,
           min(ts) AS primeira_em,
           max(ts) AS ultima_em
    FROM eventos
    GROUP BY user_id
  )
  SELECT jsonb_build_object(
    'dia', to_char(p_dia, 'YYYY-MM-DD'),
    'total_usuarios', (SELECT count(*) FROM agg),
    'total_interacoes', (SELECT coalesce(sum(interacoes), 0) FROM agg),
    'usuarios', coalesce((
      SELECT jsonb_agg(u ORDER BY (u->>'interacoes')::bigint DESC, u->>'nome')
      FROM (
        SELECT jsonb_build_object(
                 'user_id', a.user_id,
                 'nome', coalesce(p.nome_completo, split_part(p.email, '@', 1), 'Usuário removido'),
                 'email', p.email,
                 'avatar_url', p.avatar_url,
                 'interacoes', a.interacoes,
                 'tentativas', a.tentativas,
                 'respostas', a.respostas,
                 'primeira_em', a.primeira_em,
                 'ultima_em', a.ultima_em
               ) AS u
        FROM agg a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        ORDER BY a.interacoes DESC, a.user_id
        LIMIT v_limit
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_uso_usuarios_dia(date, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_get_uso_usuarios_dia(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_uso_usuarios_dia(date, integer) TO authenticated;
