-- ═══════════════════════════════════════════════════════════════════════════
-- Acessos: impersonação de admin deixa de contar como uso do dono da conta.
--
-- Sintoma: no /admin/acessos, contas que só receberam suporte apareciam com
-- uma rede a mais (o IP do admin) e, em alguns casos, com uso simultâneo.
--
-- A marcação `impersonado` existia desde 20260904120000, mas falhava em quatro
-- pontos:
--
--   1. Detecção só por tempo. O trigger marcava qualquer login do usuário
--      ocorrido até 5 min depois de uma entrada em admin_impersonation_log.
--      Errava dos dois lados: perdia a impersonação quando o GoTrue demorava,
--      e marcava como suporte o login REAL do usuário logo em seguida (o que
--      esconde compartilhamento de verdade).
--   2. Só o login era marcado. Refresh de token com troca de IP na MESMA
--      sessão de impersonação, e heartbeats do app, entravam como acesso real.
--   3. A consolidação de janelas apagava a marca: `impersonado = impersonado
--      AND p_impersonado` rebaixava para false a linha do login assim que
--      qualquer evento não marcado caía nos 30 min seguintes no mesmo IP.
--   4. A carga inicial (auth.sessions → acesso_log) não consultou o log de
--      auditoria: TODA sessão de impersonação anterior a 04/09 entrou como
--      acesso legítimo do aluno.
--
-- Correções:
--   • Detecção passa a casar o IP do admin gravado em admin_impersonation_log
--     com o IP da sessão criada. IP igual = impersonação; sem IP dos dois
--     lados, cai para janela curta de tempo (2 min).
--   • A sessão inteira herda a marca: qualquer evento com o mesmo session_id
--     de uma sessão já marcada é impersonação. O heartbeat passa a mandar o
--     session_id (vem do claim do JWT), então também herda.
--   • Janelas impersonadas e reais nunca se consolidam na mesma linha.
--   • Nova coluna admin_id: qual admin gerou o acesso de suporte.
--   • Backfill retroativo por (usuário, IP do admin, momento) + propagação
--     por session_id.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Qual admin gerou o acesso de suporte ────────────────────────────────
ALTER TABLE public.acesso_log ADD COLUMN IF NOT EXISTS admin_id uuid;

COMMENT ON COLUMN public.acesso_log.admin_id IS
  'Admin que estava impersonando quando a janela foi registrada. NULL em acesso real.';

CREATE INDEX IF NOT EXISTS acesso_log_session_idx
  ON public.acesso_log (session_id) WHERE session_id IS NOT NULL;

-- ─── 2. Cast tolerante de texto para inet ───────────────────────────────────
-- admin_impersonation_log.ip guarda o x-forwarded-for cru
-- ("189.0.0.1,189.0.0.1, 99.82.164.22"): o primeiro elemento é o IP real do
-- admin, o resto são proxies. Texto livre precisa de cast que não estoure.
CREATE OR REPLACE FUNCTION public.texto_para_inet(p_txt text)
RETURNS inet
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN btrim(p_txt)::inet;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ─── 3. Correlação sessão ↔ impersonação ────────────────────────────────────
-- Devolve o id da entrada de auditoria que explica este acesso, ou NULL.
-- A sessão do alvo nasce no MESMO navegador do admin: mesmo IP e mesmo
-- user agent que o edge function registrou segundos antes. Exigir os dois
-- evita marcar como suporte um login real do aluno que por acaso saiu do
-- mesmo IP (o que esconderia compartilhamento de verdade). Quando falta um
-- dos lados, o critério degrada para proximidade temporal apertada.
CREATE OR REPLACE FUNCTION public.impersonacao_recente(
  p_user_id    uuid,
  p_ip         inet,
  p_user_agent text DEFAULT NULL,
  p_quando     timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id
  FROM public.admin_impersonation_log l
  CROSS JOIN LATERAL (
    SELECT public.texto_para_inet(split_part(l.ip, ',', 1)) AS admin_ip,
           nullif(left(l.user_agent, 400), '')              AS admin_ua
  ) x
  WHERE l.target_id = p_user_id
    -- O log é gravado antes do magic link; a sessão aparece logo depois. O
    -- minuto de folga do outro lado cobre relógio e ordem de commit.
    AND l.criado_em <= p_quando + interval '1 minute'
    AND l.criado_em >= p_quando - interval '15 minutes'
    -- User agent divergente derruba o casamento; ausente em qualquer lado não
    -- confirma nem nega.
    AND (x.admin_ua IS NULL OR p_user_agent IS NULL
         OR x.admin_ua = left(p_user_agent, 400))
    AND (
      (x.admin_ip IS NOT NULL AND p_ip IS NOT NULL AND x.admin_ip = p_ip)
      OR ((x.admin_ip IS NULL OR p_ip IS NULL)
          AND l.criado_em >= p_quando - interval '2 minutes')
    )
  ORDER BY (x.admin_ip IS NOT DISTINCT FROM p_ip) DESC, l.criado_em DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.impersonacao_recente(uuid, inet, text, timestamptz) FROM public;
REVOKE EXECUTE ON FUNCTION public.impersonacao_recente(uuid, inet, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.impersonacao_recente(uuid, inet, text, timestamptz) FROM authenticated;

-- ─── 4. Gravação de evento ──────────────────────────────────────────────────
-- Assinatura muda (ganha p_admin_id): DROP + CREATE, senão vira sobrecarga
-- ambígua com a versão de 20260904120000.
DROP FUNCTION IF EXISTS public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean);

CREATE FUNCTION public.registrar_acesso_evento(
  p_user_id     uuid,
  p_ip          inet,
  p_user_agent  text,
  p_origem      text,
  p_device_id   uuid DEFAULT NULL,
  p_session_id  uuid DEFAULT NULL,
  p_pais        text DEFAULT NULL,
  p_impersonado boolean DEFAULT false,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     bigint;
  v_imp    boolean := coalesce(p_impersonado, false);
  v_janela CONSTANT interval := interval '30 minutes';
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Linha recente do mesmo usuário/IP cujo dispositivo e sessão não conflitam.
  -- O `IS NULL` nas pontas deixa o heartbeat (que traz device_id) se juntar à
  -- linha criada pelo login (que não tem), preenchendo-a.
  --
  -- `impersonado = v_imp` é o que impede o suporte de contaminar a janela real
  -- e vice-versa: antes, um evento não marcado no mesmo IP rebaixava a linha
  -- do login de impersonação para acesso legítimo.
  SELECT id INTO v_id
  FROM public.acesso_log
  WHERE user_id = p_user_id
    AND ultimo_em > now() - v_janela
    AND ip IS NOT DISTINCT FROM p_ip
    AND impersonado = v_imp
    AND (device_id  IS NULL OR p_device_id  IS NULL OR device_id  = p_device_id)
    AND (session_id IS NULL OR p_session_id IS NULL OR session_id = p_session_id)
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
           admin_id    = coalesce(admin_id, p_admin_id)
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.acesso_log (
    user_id, ip, pais, user_agent, dispositivo, device_id, session_id, origem,
    impersonado, admin_id
  ) VALUES (
    p_user_id, p_ip, p_pais, p_user_agent, public.rotulo_dispositivo(p_user_agent),
    p_device_id, p_session_id, p_origem, v_imp, p_admin_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso_evento(uuid, inet, text, text, uuid, uuid, text, boolean, uuid) FROM authenticated;

-- ─── 5. Trigger em auth.sessions ────────────────────────────────────────────
-- ⚠️ Roda dentro da transação de login do GoTrue. Corpo inteiro em bloco com
-- EXCEPTION: monitoramento quebrado NUNCA pode impedir alguém de logar.
CREATE OR REPLACE FUNCTION public.trg_acesso_sessao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id      uuid;
  v_impersonado boolean := false;
  v_admin_id    uuid;
BEGIN
  BEGIN
    -- Uma sessão já marcada continua marcada em todos os eventos seguintes
    -- (refresh com troca de IP durante o atendimento).
    SELECT true, al.admin_id
      INTO v_impersonado, v_admin_id
    FROM public.acesso_log al
    WHERE al.session_id = NEW.id
      AND al.impersonado
    LIMIT 1;

    IF NOT coalesce(v_impersonado, false) THEN
      v_log_id := public.impersonacao_recente(
        NEW.user_id, NEW.ip, left(NEW.user_agent, 400), now());
      IF v_log_id IS NOT NULL THEN
        v_impersonado := true;
        SELECT l.admin_id INTO v_admin_id
        FROM public.admin_impersonation_log l WHERE l.id = v_log_id;
      END IF;
    END IF;

    PERFORM public.registrar_acesso_evento(
      p_user_id     => NEW.user_id,
      p_ip          => NEW.ip,
      p_user_agent  => left(NEW.user_agent, 400),
      p_origem      => CASE WHEN TG_OP = 'INSERT' THEN 'login' ELSE 'refresh' END,
      p_device_id   => NULL,
      p_session_id  => NEW.id,
      p_pais        => NULL,
      p_impersonado => coalesce(v_impersonado, false),
      p_admin_id    => v_admin_id
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

-- ─── 6. Heartbeat do app ────────────────────────────────────────────────────
-- O frontend já evita chamar durante impersonação, mas isso é garantia de
-- cliente: aqui a sessão é reconhecida pelo claim do JWT e herda a marca.
CREATE OR REPLACE FUNCTION public.registrar_acesso(p_device_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_headers  jsonb;
  v_ip_txt   text;
  v_ip       inet;
  v_ua       text;
  v_pais     text;
  v_recentes integer;
  v_session  uuid;
  v_imp      boolean := false;
  v_admin_id uuid;
  v_log_id   uuid;
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
  v_ip   := public.texto_para_inet(v_ip_txt);
  v_pais := nullif(btrim(coalesce(v_headers ->> 'cf-ipcountry', '')), '');
  v_ua   := nullif(left(coalesce(v_headers ->> 'user-agent', ''), 400), '');

  -- session_id vem do claim do próprio token: liga o heartbeat à sessão que o
  -- trigger de login já classificou.
  BEGIN
    v_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_session := NULL;
  END;

  IF v_session IS NOT NULL THEN
    SELECT true, al.admin_id INTO v_imp, v_admin_id
    FROM public.acesso_log al
    WHERE al.session_id = v_session AND al.impersonado
    LIMIT 1;
  END IF;

  -- Sessão de impersonação ainda sem linha (trigger falhou, ou heartbeat
  -- chegou primeiro): cai na correlação por IP do admin.
  IF NOT coalesce(v_imp, false) THEN
    v_log_id := public.impersonacao_recente(v_user, v_ip, v_ua, now());
    IF v_log_id IS NOT NULL THEN
      v_imp := true;
      SELECT l.admin_id INTO v_admin_id
      FROM public.admin_impersonation_log l WHERE l.id = v_log_id;
    END IF;
  END IF;

  PERFORM public.registrar_acesso_evento(
    p_user_id     => v_user,
    p_ip          => v_ip,
    p_user_agent  => v_ua,
    p_origem      => 'app',
    p_device_id   => p_device_id,
    p_session_id  => v_session,
    p_pais        => v_pais,
    p_impersonado => coalesce(v_imp, false),
    p_admin_id    => v_admin_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_acesso(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.registrar_acesso(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_acesso(uuid) TO authenticated;

-- ─── 7. Backfill ────────────────────────────────────────────────────────────
-- (a) Janelas cujo IP é o do admin no momento de uma impersonação daquele
--     mesmo usuário. Pega principalmente as linhas herdadas da carga inicial,
--     que nunca consultaram o log de auditoria.
WITH corr AS (
  SELECT a.id AS acesso_id, l.admin_id
  FROM public.acesso_log a
  JOIN LATERAL (
    SELECT l.id, l.admin_id
    FROM public.admin_impersonation_log l
    WHERE l.target_id = a.user_id
      AND l.criado_em <= a.primeiro_em + interval '1 minute'
      AND l.criado_em >= a.primeiro_em - interval '15 minutes'
      AND public.texto_para_inet(split_part(l.ip, ',', 1)) = a.ip
      AND (nullif(left(l.user_agent, 400), '') IS NULL OR a.user_agent IS NULL
           OR nullif(left(l.user_agent, 400), '') = a.user_agent)
    ORDER BY l.criado_em DESC
    LIMIT 1
  ) l ON true
  WHERE NOT a.impersonado
    AND a.ip IS NOT NULL
)
UPDATE public.acesso_log a
   SET impersonado = true,
       admin_id    = coalesce(a.admin_id, corr.admin_id)
  FROM corr
 WHERE a.id = corr.acesso_id;

-- (b) Propaga para o resto da sessão (refresh de IP durante o atendimento).
UPDATE public.acesso_log a
   SET impersonado = true,
       admin_id    = coalesce(a.admin_id, s.admin_id)
  FROM (
    SELECT session_id, min(admin_id::text)::uuid AS admin_id
    FROM public.acesso_log
    WHERE impersonado AND session_id IS NOT NULL
    GROUP BY session_id
  ) s
 WHERE a.session_id = s.session_id
   AND NOT a.impersonado;

-- ─── 8. Detalhe do usuário: expor quantas janelas foram ignoradas ───────────
-- Sem isso não dá para distinguir "conta limpa" de "conta cujo suporte sumiu
-- do cálculo". Só o bloco `totais` muda; o resto é idêntico à versão de
-- 20260904170124.
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
           primeiro_em, ultimo_em, eventos, impersonado, admin_id,
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
               'janelas', count(*) FILTER (WHERE NOT impersonado),
               'eventos', coalesce(sum(eventos) FILTER (WHERE NOT impersonado), 0),
               'ips', count(DISTINCT ip) FILTER (WHERE NOT impersonado),
               'redes', count(DISTINCT rede) FILTER (WHERE NOT impersonado),
               'dispositivos', count(DISTINCT device_id) FILTER (WHERE NOT impersonado),
               'navegadores', count(DISTINCT dispositivo) FILTER (WHERE NOT impersonado),
               'paises', count(DISTINCT pais) FILTER (WHERE NOT impersonado),
               'sessoes', count(DISTINCT session_id) FILTER (WHERE NOT impersonado),
               'impersonados', count(*) FILTER (WHERE impersonado)
             )
      FROM base
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
