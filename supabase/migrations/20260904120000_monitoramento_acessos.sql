-- ═══════════════════════════════════════════════════════════════════════════
-- Monitoramento de acessos por IP — detecção de contas compartilhadas
--
-- Objetivo: ter histórico de "de onde cada conta é acessada" para identificar
-- assinaturas usadas por mais de uma pessoa. Nesta fase é SÓ OBSERVAÇÃO:
-- nada bloqueia, expira sessão ou avisa o usuário.
--
-- Duas fontes de evento alimentam public.acesso_log:
--   1. Trigger em auth.sessions — todo login novo (e toda troca de IP dentro
--      de uma sessão existente). Server-side, não depende do frontend, pega
--      qualquer cliente. IP e user_agent vêm do próprio GoTrue.
--   2. RPC registrar_acesso() — "heartbeat" que o app chama ao abrir e a cada
--      ~30 min de uso. É o que permite detectar USO SIMULTÂNEO de redes
--      diferentes, o sinal forte de compartilhamento: só com login não dá para
--      ver duas pessoas usando a conta ao mesmo tempo em sessões antigas.
--
-- O IP no caminho RPC sai de cf-connecting-ip (header que o Cloudflare à frente
-- do Supabase reescreve — o cliente não consegue forjar), com fallback para o
-- primeiro elemento de x-forwarded-for. cf-ipcountry dá o país sem API externa.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS (não regenerar via db pull/db diff):
-- este arquivo revoga EXECUTE de anon/public em RPCs admin. Um db pull
-- posterior pode re-emitir grants default — revisar o diff sempre.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabela ──────────────────────────────────────────────────────────────
-- Cada linha é uma JANELA DE PRESENÇA, não um evento solto: eventos do mesmo
-- usuário, mesmo IP e mesmo dispositivo dentro de 30 min são consolidados
-- (ultimo_em/eventos). Mantém o volume baixo e dá intervalos [primeiro_em,
-- ultimo_em] com os quais a detecção de simultaneidade fica trivial.
CREATE TABLE IF NOT EXISTS public.acesso_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip           inet,
  pais         text,
  user_agent   text,
  -- Rótulo curto derivado do user_agent ("Chrome · Android"), para a UI.
  dispositivo  text,
  -- UUID estável guardado no localStorage do navegador. Distingue dois
  -- dispositivos atrás do mesmo IP e segue o mesmo dispositivo trocando de
  -- rede. É apagável pelo usuário — sinal auxiliar, nunca prova.
  device_id    uuid,
  -- auth.sessions.id quando o evento veio do trigger de login.
  session_id   uuid,
  -- 'login' | 'refresh' (troca de IP na mesma sessão) | 'app' (heartbeat)
  origem       text NOT NULL,
  -- true enquanto TODOS os eventos da linha vieram de impersonação de admin:
  -- nesse caso o IP é o do admin, não o do dono da conta. Excluído das análises.
  impersonado  boolean NOT NULL DEFAULT false,
  primeiro_em  timestamptz NOT NULL DEFAULT now(),
  ultimo_em    timestamptz NOT NULL DEFAULT now(),
  eventos      integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.acesso_log IS
  'Histórico de acessos por IP/dispositivo, para detectar contas compartilhadas. Retenção de 180 dias (cron purgar_acesso_log).';

CREATE INDEX IF NOT EXISTS acesso_log_user_ultimo_idx ON public.acesso_log (user_id, ultimo_em DESC);
CREATE INDEX IF NOT EXISTS acesso_log_ultimo_idx      ON public.acesso_log (ultimo_em DESC);
CREATE INDEX IF NOT EXISTS acesso_log_ip_idx          ON public.acesso_log (ip);
CREATE INDEX IF NOT EXISTS acesso_log_device_idx      ON public.acesso_log (device_id) WHERE device_id IS NOT NULL;

-- ─── 2. RLS ─────────────────────────────────────────────────────────────────
-- Só admin lê, e apenas por leitura direta; escrita é exclusiva das funções
-- SECURITY DEFINER abaixo (nenhuma policy de INSERT/UPDATE/DELETE existe).
ALTER TABLE public.acesso_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acesso_log_admin_select ON public.acesso_log;
CREATE POLICY acesso_log_admin_select ON public.acesso_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.acesso_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.acesso_log FROM authenticated;
GRANT SELECT ON public.acesso_log TO authenticated;

-- ─── 3. Rótulo de dispositivo a partir do user_agent ────────────────────────
-- Heurística deliberadamente grosseira: serve para diferenciar "Chrome ·
-- Android" de "Safari · iPhone" na tela, não para fingerprinting.
CREATE OR REPLACE FUNCTION public.rotulo_dispositivo(p_ua text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN p_ua IS NULL OR btrim(p_ua) = '' THEN NULL ELSE
    CASE
      WHEN p_ua ILIKE '%edg/%'                        THEN 'Edge'
      WHEN p_ua ILIKE '%opr/%' OR p_ua ILIKE '%opera%' THEN 'Opera'
      WHEN p_ua ILIKE '%samsungbrowser%'              THEN 'Samsung Internet'
      WHEN p_ua ILIKE '%firefox%' OR p_ua ILIKE '%fxios%' THEN 'Firefox'
      WHEN p_ua ILIKE '%chrome%' OR p_ua ILIKE '%crios%'  THEN 'Chrome'
      WHEN p_ua ILIKE '%safari%'                      THEN 'Safari'
      ELSE 'Outro'
    END
    || ' · ' ||
    CASE
      WHEN p_ua ILIKE '%iphone%'   THEN 'iPhone'
      WHEN p_ua ILIKE '%ipad%'     THEN 'iPad'
      WHEN p_ua ILIKE '%android%'  THEN 'Android'
      WHEN p_ua ILIKE '%windows%'  THEN 'Windows'
      WHEN p_ua ILIKE '%mac os%'   THEN 'macOS'
      WHEN p_ua ILIKE '%linux%'    THEN 'Linux'
      ELSE 'Desconhecido'
    END
  END;
$$;

-- Rede aproximada do IP: /24 em IPv4, /48 em IPv6. Agrupa endereços que quase
-- sempre pertencem ao mesmo provedor/local — troca de IP dinâmico dentro da
-- mesma casa não conta como "outra rede".
CREATE OR REPLACE FUNCTION public.rede_do_ip(p_ip inet)
RETURNS cidr
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_ip IS NULL THEN NULL
    WHEN family(p_ip) = 4 THEN network(set_masklen(p_ip, 24))
    ELSE network(set_masklen(p_ip, 48))
  END;
$$;

-- ─── 4. Gravação de evento (interna) ────────────────────────────────────────
-- Consolida no registro recente compatível ou cria um novo. Chamada tanto pelo
-- trigger de auth.sessions quanto pelo RPC de heartbeat.
CREATE OR REPLACE FUNCTION public.registrar_acesso_evento(
  p_user_id     uuid,
  p_ip          inet,
  p_user_agent  text,
  p_origem      text,
  p_device_id   uuid DEFAULT NULL,
  p_session_id  uuid DEFAULT NULL,
  p_pais        text DEFAULT NULL,
  p_impersonado boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     bigint;
  v_janela CONSTANT interval := interval '30 minutes';
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Linha recente do mesmo usuário/IP cujo dispositivo não conflita. O
  -- `IS NULL` nas duas pontas deixa o heartbeat (que traz device_id) se juntar
  -- à linha criada pelo login (que não tem), preenchendo-a.
  SELECT id INTO v_id
  FROM public.acesso_log
  WHERE user_id = p_user_id
    AND ultimo_em > now() - v_janela
    AND ip IS NOT DISTINCT FROM p_ip
    AND (device_id IS NULL OR p_device_id IS NULL OR device_id = p_device_id)
  ORDER BY ultimo_em DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.acesso_log
       SET ultimo_em   = greatest(ultimo_em, now()),
           eventos     = eventos + 1,
           device_id   = coalesce(device_id, p_device_id),
           session_id  = coalesce(session_id, p_session_id),
           user_agent  = coalesce(user_agent, p_user_agent),
           dispositivo = coalesce(dispositivo, public.rotulo_dispositivo(p_user_agent)),
           pais        = coalesce(pais, p_pais),
           -- deixa de ser "só impersonação" assim que um evento real cai aqui
           impersonado = impersonado AND p_impersonado
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.acesso_log (
    user_id, ip, pais, user_agent, dispositivo, device_id, session_id, origem, impersonado
  ) VALUES (
    p_user_id, p_ip, p_pais, p_user_agent, public.rotulo_dispositivo(p_user_agent),
    p_device_id, p_session_id, p_origem, p_impersonado
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean) FROM public;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean) FROM authenticated;

-- ─── 5. Trigger em auth.sessions ────────────────────────────────────────────
-- ⚠️ Roda dentro da transação de login do GoTrue. Todo o corpo está em bloco
-- com EXCEPTION: monitoramento quebrado NUNCA pode impedir alguém de logar.
CREATE OR REPLACE FUNCTION public.trg_acesso_sessao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_impersonado boolean := false;
BEGIN
  BEGIN
    -- Impersonação de admin cria uma sessão real do usuário-alvo a partir do
    -- navegador do admin: sem esta marcação, todo suporte viraria falso
    -- positivo de compartilhamento.
    SELECT EXISTS (
      SELECT 1 FROM public.admin_impersonation_log
      WHERE target_id = NEW.user_id
        AND criado_em > now() - interval '5 minutes'
    ) INTO v_impersonado;

    PERFORM public.registrar_acesso_evento(
      p_user_id     => NEW.user_id,
      p_ip          => NEW.ip,
      p_user_agent  => left(NEW.user_agent, 400),
      p_origem      => CASE WHEN TG_OP = 'INSERT' THEN 'login' ELSE 'refresh' END,
      p_device_id   => NULL,
      p_session_id  => NEW.id,
      p_pais        => NULL,
      p_impersonado => v_impersonado
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_acesso_sessao() FROM public;
REVOKE EXECUTE ON FUNCTION public.trg_acesso_sessao() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_acesso_sessao() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trg_acesso_sessao() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS trg_acesso_sessao_insert ON auth.sessions;
CREATE TRIGGER trg_acesso_sessao_insert
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_acesso_sessao();

DROP TRIGGER IF EXISTS trg_acesso_sessao_ip ON auth.sessions;
CREATE TRIGGER trg_acesso_sessao_ip
  AFTER UPDATE ON auth.sessions
  FOR EACH ROW
  WHEN (NEW.ip IS DISTINCT FROM OLD.ip)
  EXECUTE FUNCTION public.trg_acesso_sessao();

-- ─── 6. Heartbeat chamado pelo app ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_acesso(p_device_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_headers jsonb;
  v_ip_txt  text;
  v_ip      inet;
  v_ua      text;
  v_pais    text;
  v_recentes integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  -- Teto de linhas novas por hora: um cliente malicioso poderia inflar a tabela
  -- variando p_device_id a cada chamada.
  SELECT count(*) INTO v_recentes
  FROM public.acesso_log
  WHERE user_id = v_user
    AND primeiro_em > now() - interval '1 hour';
  IF v_recentes > 20 THEN
    RETURN;
  END IF;

  v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);

  -- cf-connecting-ip é escrito pelo Cloudflare à frente do Supabase e sobrepõe
  -- qualquer valor mandado pelo cliente; x-forwarded-for é fallback.
  v_ip_txt := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  BEGIN
    v_ip := v_ip_txt::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  v_pais := nullif(btrim(coalesce(v_headers ->> 'cf-ipcountry', '')), '');
  v_ua   := nullif(left(coalesce(v_headers ->> 'user-agent', ''), 400), '');

  PERFORM public.registrar_acesso_evento(
    p_user_id    => v_user,
    p_ip         => v_ip,
    p_user_agent => v_ua,
    p_origem     => 'app',
    p_device_id  => p_device_id,
    p_pais       => v_pais
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_acesso(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_acesso(uuid) TO authenticated;

-- ─── 7. Análise: ranking de contas com indício de compartilhamento ──────────
-- Não decide nada: entrega as evidências (redes, dispositivos, países e
-- sobreposições de horário) ordenadas para inspeção humana.
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
  result       jsonb;
  v_dias       integer := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_limit      integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_desde      timestamptz;
  -- Folga aplicada ao fim de cada janela de presença antes de testar
  -- sobreposição: dois acessos de redes diferentes com menos de 10 min entre
  -- eles contam como simultâneos.
  v_tolerancia CONSTANT interval := interval '10 minutes';
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
           count(*)                                        AS janelas,
           coalesce(sum(eventos), 0)                       AS eventos,
           count(DISTINCT ip)                              AS ips,
           count(DISTINCT rede)                            AS redes,
           count(DISTINCT device_id)                       AS dispositivos,
           count(DISTINCT dispositivo)                     AS navegadores,
           count(DISTINCT pais)                            AS paises,
           count(DISTINCT session_id)                      AS sessoes,
           min(primeiro_em)                                AS primeiro_em,
           max(ultimo_em)                                  AS ultimo_em
    FROM base
    GROUP BY user_id
  ),
  -- Pares de janelas do mesmo usuário, em redes diferentes, com horários que
  -- se cruzam. Pares do MESMO device_id são ignorados: é o mesmo navegador
  -- trocando de rede (wi-fi → 4G), não duas pessoas.
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
     AND tstzrange(a.primeiro_em, a.ultimo_em + v_tolerancia)
      && tstzrange(b.primeiro_em, b.ultimo_em + v_tolerancia)
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

-- ─── 8. Análise: detalhe de um usuário ──────────────────────────────────────
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
  result       jsonb;
  v_dias       integer := least(greatest(coalesce(p_dias, 90), 1), 365);
  v_limit      integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_desde      timestamptz;
  v_tolerancia CONSTANT interval := interval '10 minutes';
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
           max(pais)              AS pais,
           count(*)               AS janelas,
           sum(eventos)           AS eventos,
           count(DISTINCT device_id) AS dispositivos,
           min(primeiro_em)       AS primeiro_em,
           max(ultimo_em)         AS ultimo_em,
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
     AND tstzrange(a.primeiro_em, a.ultimo_em + v_tolerancia)
      && tstzrange(b.primeiro_em, b.ultimo_em + v_tolerancia)
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

-- ─── 9. Análise: redes usadas por mais de uma conta ─────────────────────────
-- Ângulo inverso: em vez de "uma conta em muitos lugares", "muitas contas num
-- lugar só". Wi-fi de faculdade aparece aqui e é falso positivo esperado — por
-- isso a lista traz as contas para julgamento humano.
CREATE OR REPLACE FUNCTION public.admin_get_redes_multiconta(
  p_dias  integer DEFAULT 30,
  p_min   integer DEFAULT 2,
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
  v_min   integer := greatest(coalesce(p_min, 2), 2);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_desde timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_desde := now() - make_interval(days => v_dias);

  WITH base AS (
    SELECT user_id, ip, pais, device_id, dispositivo, primeiro_em, ultimo_em,
           public.rede_do_ip(ip) AS rede
    FROM public.acesso_log
    WHERE ultimo_em >= v_desde
      AND NOT impersonado
      AND ip IS NOT NULL
  ),
  redes AS (
    SELECT rede,
           count(DISTINCT user_id)   AS contas,
           count(DISTINCT ip)        AS ips,
           count(DISTINCT device_id) AS dispositivos,
           max(ultimo_em)            AS ultimo_em
    FROM base
    GROUP BY rede
    HAVING count(DISTINCT user_id) >= v_min
  )
  SELECT jsonb_build_object(
    'dias', v_dias,
    'total_redes', (SELECT count(*) FROM redes),
    'redes', coalesce((
      SELECT jsonb_agg(r ORDER BY (r->>'contas')::int DESC, r->>'ultimo_em' DESC)
      FROM (
        SELECT jsonb_build_object(
                 'rede', rd.rede,
                 'contas', rd.contas,
                 'ips', rd.ips,
                 'dispositivos', rd.dispositivos,
                 'ultimo_em', rd.ultimo_em,
                 'usuarios', (
                   SELECT jsonb_agg(DISTINCT jsonb_build_object(
                            'user_id', b.user_id,
                            'nome', coalesce(p.nome_completo, split_part(p.email, '@', 1), 'Usuário removido'),
                            'email', p.email
                          ))
                   FROM base b
                   LEFT JOIN public.profiles p ON p.id = b.user_id
                   WHERE b.rede = rd.rede
                 )
               ) AS r
        FROM redes rd
        ORDER BY rd.contas DESC, rd.ultimo_em DESC
        LIMIT v_limit
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_redes_multiconta(integer, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_get_redes_multiconta(integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_redes_multiconta(integer, integer, integer) TO authenticated;

-- ─── 10. Carga inicial a partir das sessões vivas ───────────────────────────
-- auth.sessions é um retrato do agora (some no logout/expiração), mas o que
-- está lá já é histórico útil no dia 1.
INSERT INTO public.acesso_log (user_id, ip, user_agent, dispositivo, session_id, origem, primeiro_em, ultimo_em)
SELECT s.user_id,
       s.ip,
       left(s.user_agent, 400),
       public.rotulo_dispositivo(s.user_agent),
       s.id,
       'login',
       s.created_at,
       coalesce(s.refreshed_at AT TIME ZONE 'UTC', s.updated_at, s.created_at)
FROM auth.sessions s
WHERE s.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.acesso_log al WHERE al.session_id = s.id
  );

-- ─── 11. Retenção: 180 dias ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purgar_acesso_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.acesso_log WHERE ultimo_em < now() - interval '180 days';
$$;

REVOKE EXECUTE ON FUNCTION public.purgar_acesso_log() FROM public;
REVOKE EXECUTE ON FUNCTION public.purgar_acesso_log() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purgar_acesso_log() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purgar-acesso-log')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purgar-acesso-log');
    PERFORM cron.schedule('purgar-acesso-log', '17 4 * * *', 'SELECT public.purgar_acesso_log()');
  END IF;
END;
$$;
