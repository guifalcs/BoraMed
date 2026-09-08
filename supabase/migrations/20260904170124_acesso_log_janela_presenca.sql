-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige a detecção de uso simultâneo em acesso_log.
--
-- Problema: a carga inicial da migration 20260904120000 copiou auth.sessions
-- para acesso_log usando [created_at, refreshed_at] como janela. Uma sessão de
-- login vive semanas, então essas linhas viraram intervalos gigantescos. Duas
-- sessões abertas em redes diferentes no mesmo mês passaram a se cruzar por
-- construção, e cada cruzamento vale 15 pontos no score: quem tem celular e
-- notebook estourou o teto de 100 sem nunca ter usado os dois ao mesmo tempo.
--
-- Correção: antes de testar sobreposição, a janela de cada linha é limitada a
-- 30 minutos a partir de primeiro_em — o mesmo tamanho da janela de
-- consolidação de eventos. Linhas normais não mudam (já nascem menores que
-- isso); as linhas herdadas da carga inicial deixam de se cruzar entre si.
-- Só o cálculo muda, nenhum dado é reescrito.
-- ═══════════════════════════════════════════════════════════════════════════

-- Janela de presença efetiva de uma linha, com a tolerância de 10 min já
-- somada: dois acessos separados por menos de 10 min contam como simultâneos.
CREATE OR REPLACE FUNCTION public.janela_presenca(p_ini timestamptz, p_fim timestamptz)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT tstzrange(
    p_ini,
    least(coalesce(p_fim, p_ini), p_ini + interval '30 minutes') + interval '10 minutes'
  );
$$;

COMMENT ON FUNCTION public.janela_presenca(timestamptz, timestamptz) IS
  'Intervalo usado na detecção de uso simultâneo: no máximo 30 min de presença + 10 min de tolerância.';

-- ─── Ranking de contas ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_acessos_resumo(
  p_dias  integer DEFAULT 30,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result  jsonb;
  v_dias  integer := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_desde timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_desde := now() - make_interval(days => v_dias);

  WITH base AS (
    SELECT id, user_id, ip, pais, dispositivo, device_id, session_id,
           primeiro_em, ultimo_em, eventos,
           public.rede_do_ip(ip) AS rede
    FROM public.acesso_log
    WHERE ultimo_em >= v_desde
      AND NOT impersonado
  ),
  agg AS (
    SELECT user_id,
           count(*)                    AS janelas,
           coalesce(sum(eventos), 0)   AS eventos,
           count(DISTINCT ip)          AS ips,
           count(DISTINCT rede)        AS redes,
           count(DISTINCT device_id)   AS dispositivos,
           count(DISTINCT dispositivo) AS navegadores,
           count(DISTINCT pais)        AS paises,
           count(DISTINCT session_id)  AS sessoes,
           min(primeiro_em)            AS primeiro_em,
           max(ultimo_em)              AS ultimo_em
    FROM base
    GROUP BY user_id
  ),
  sobre AS (
    SELECT a.user_id, count(*) AS sobreposicoes
    FROM base a
    JOIN base b
      ON b.user_id = a.user_id
     AND b.id > a.id
     AND a.rede IS DISTINCT FROM b.rede
     AND a.rede IS NOT NULL
     AND b.rede IS NOT NULL
     AND NOT (a.device_id IS NOT NULL AND a.device_id = b.device_id)
     AND public.janela_presenca(a.primeiro_em, a.ultimo_em)
      && public.janela_presenca(b.primeiro_em, b.ultimo_em)
    GROUP BY a.user_id
  ),
  scored AS (
    SELECT ag.*,
           coalesce(s.sobreposicoes, 0) AS sobreposicoes,
           least(100,
                 greatest(ag.redes - 1, 0) * 4
               + greatest(greatest(ag.dispositivos, ag.navegadores) - 1, 0) * 8
               + coalesce(s.sobreposicoes, 0) * 15
               + greatest(ag.paises - 1, 0) * 20
           ) AS score
    FROM agg ag
    LEFT JOIN sobre s ON s.user_id = ag.user_id
  )
  SELECT jsonb_build_object(
    'dias', v_dias,
    'gerado_em', now(),
    'total_usuarios', (SELECT count(*) FROM scored),
    'total_janelas', (SELECT coalesce(sum(janelas), 0) FROM scored),
    'com_sobreposicao', (SELECT count(*) FROM scored WHERE sobreposicoes > 0),
    'usuarios', coalesce((
      SELECT jsonb_agg(u ORDER BY (u->>'score')::int DESC, (u->>'sobreposicoes')::int DESC, u->>'nome')
      FROM (
        SELECT jsonb_build_object(
                 'user_id', sc.user_id,
                 'nome', coalesce(p.nome_completo, split_part(p.email, '@', 1), 'Usuário removido'),
                 'email', p.email,
                 'avatar_url', p.avatar_url,
                 'papel', p.papel,
                 'banido', coalesce(p.banido, false),
                 'plano', pl.nome,
                 'assinatura_ativa', (a.id IS NOT NULL),
                 'janelas', sc.janelas,
                 'eventos', sc.eventos,
                 'ips', sc.ips,
                 'redes', sc.redes,
                 'dispositivos', sc.dispositivos,
                 'navegadores', sc.navegadores,
                 'paises', sc.paises,
                 'sessoes', sc.sessoes,
                 'sobreposicoes', sc.sobreposicoes,
                 'score', sc.score,
                 'nivel', CASE WHEN sc.score >= 40 THEN 'alto'
                               WHEN sc.score >= 20 THEN 'medio'
                               ELSE 'baixo' END,
                 'primeiro_em', sc.primeiro_em,
                 'ultimo_em', sc.ultimo_em
               ) AS u
        FROM scored sc
        LEFT JOIN public.profiles p ON p.id = sc.user_id
        LEFT JOIN LATERAL (
          SELECT asg.id, asg.plano_id
          FROM public.assinatura asg
          WHERE asg.user_id = sc.user_id
            AND asg.status = 'authorized'
          ORDER BY asg.criado_em DESC
          LIMIT 1
        ) a ON true
        LEFT JOIN public.plano pl ON pl.id = a.plano_id
        ORDER BY sc.score DESC, sc.sobreposicoes DESC, sc.user_id
        LIMIT v_limit
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_acessos_resumo(integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_get_acessos_resumo(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_acessos_resumo(integer, integer) TO authenticated;

-- ─── Detalhe de um usuário ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_acessos_usuario(
  p_user_id uuid,
  p_dias    integer DEFAULT 90,
  p_limit   integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result  jsonb;
  v_dias  integer := least(greatest(coalesce(p_dias, 90), 1), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_desde timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_obrigatorio';
  END IF;

  v_desde := now() - make_interval(days => v_dias);

  WITH base AS (
    SELECT id, ip, pais, dispositivo, device_id, session_id, origem,
           primeiro_em, ultimo_em, eventos, impersonado,
           public.rede_do_ip(ip) AS rede
    FROM public.acesso_log
    WHERE user_id = p_user_id
      AND ultimo_em >= v_desde
  ),
  reais AS (
    SELECT * FROM base WHERE NOT impersonado
  ),
  por_ip AS (
    SELECT ip, rede,
           max(pais)                 AS pais,
           count(*)                  AS janelas,
           sum(eventos)              AS eventos,
           count(DISTINCT device_id) AS dispositivos,
           min(primeiro_em)          AS primeiro_em,
           max(ultimo_em)            AS ultimo_em,
           (array_agg(DISTINCT dispositivo) FILTER (WHERE dispositivo IS NOT NULL)) AS rotulos
    FROM reais
    GROUP BY ip, rede
  ),
  pares AS (
    SELECT a.primeiro_em AS a_inicio, a.ultimo_em AS a_fim, a.ip AS a_ip, a.dispositivo AS a_disp,
           b.primeiro_em AS b_inicio, b.ultimo_em AS b_fim, b.ip AS b_ip, b.dispositivo AS b_disp
    FROM reais a
    JOIN reais b
      ON b.id > a.id
     AND a.rede IS DISTINCT FROM b.rede
     AND a.rede IS NOT NULL AND b.rede IS NOT NULL
     AND NOT (a.device_id IS NOT NULL AND a.device_id = b.device_id)
     AND public.janela_presenca(a.primeiro_em, a.ultimo_em)
      && public.janela_presenca(b.primeiro_em, b.ultimo_em)
    ORDER BY a.primeiro_em DESC
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'dias', v_dias,
    'usuario', (
      SELECT jsonb_build_object(
               'user_id', p.id,
               'nome', coalesce(p.nome_completo, split_part(p.email, '@', 1), 'Usuário removido'),
               'email', p.email,
               'avatar_url', p.avatar_url,
               'papel', p.papel,
               'banido', coalesce(p.banido, false),
               'criado_em', p.criado_em,
               'ultimo_login', p.ultimo_login
             )
      FROM public.profiles p WHERE p.id = p_user_id
    ),
    'totais', (
      SELECT jsonb_build_object(
               'janelas', count(*),
               'eventos', coalesce(sum(eventos), 0),
               'ips', count(DISTINCT ip),
               'redes', count(DISTINCT rede),
               'dispositivos', count(DISTINCT device_id),
               'navegadores', count(DISTINCT dispositivo),
               'paises', count(DISTINCT pais),
               'sessoes', count(DISTINCT session_id)
             )
      FROM reais
    ),
    'sobreposicoes', coalesce((SELECT jsonb_agg(to_jsonb(pares)) FROM pares), '[]'::jsonb),
    'por_ip', coalesce((
      SELECT jsonb_agg(to_jsonb(por_ip) ORDER BY por_ip.ultimo_em DESC) FROM por_ip
    ), '[]'::jsonb),
    'acessos', coalesce((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.ultimo_em DESC)
      FROM (SELECT * FROM base ORDER BY ultimo_em DESC LIMIT v_limit) a
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_acessos_usuario(uuid, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_get_acessos_usuario(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_acessos_usuario(uuid, integer, integer) TO authenticated;
