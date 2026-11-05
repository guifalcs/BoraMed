-- ════════════════════════════════════════════════════════════════════════════
-- Gabaritos extraoficiais de provas (recurso gratuito e público)
--
-- A equipe (Arthur) cadastra no /admin/gabaritos o gabarito de uma prova que
-- acabou de acontecer (ex.: N2 do 3º período) e publica antes do oficial sair.
-- Qualquer pessoa, logada ou não, vê em /gabaritos e confere a própria nota.
--
-- Posicionamento: gabarito EXTRAOFICIAL elaborado pela equipe BoraMed. Nenhum
-- vínculo com a Afya. Guardamos só número → letra (e comentário opcional da
-- equipe); o enunciado da prova não entra aqui.
--
-- Estrutura:
--   gabarito_prova          → cabeçalho (tipo de prova, período, semestre…)
--   gabarito_prova_questao  → 1 linha por questão (letra, anulada, comentário)
--
-- Acesso:
--   * Tabelas: RLS admin-only, sem grant para `anon`. Escrita (inclusive
--     exclusão) só por RPC; `authenticated` tem apenas SELECT (filtrado a admin).
--   * Ver as RESPOSTAS exige conta: `get_gabarito_prova` só executa para
--     `authenticated`. O visitante sem login recebe apenas a vitrine
--     (`get_gabarito_prova_vitrine`: prova, período, nº de questões, sem
--     nenhuma letra) e a lista (`listar_gabaritos_provas`), e a página
--     pública o convida a se cadastrar. As três RPCs são SECURITY DEFINER e
--     só devolvem o que está publicado, então o rascunho nunca vaza pela anon
--     key, mesmo que um `db pull` futuro re-emita grants default nas tabelas.
--
-- ⚠️ Migration escrita à mão e testada local (não regenerar via db pull: o
-- autogerado re-emite grants default e reabre as tabelas para `anon`).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tabela: gabarito_prova ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gabarito_prova (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificador estável do link público (/gabaritos/<slug>). Gerado na
  -- criação e NUNCA reescrito: o link já circulou em grupo de WhatsApp.
  slug              TEXT        NOT NULL UNIQUE
                                CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  -- Texto livre curto (N1, N2, P1, P2, Integradora, TPI…): a UI sugere os
  -- comuns, mas não amarramos a uma lista para não travar prova nova.
  tipo_prova        TEXT        NOT NULL CHECK (length(btrim(tipo_prova)) BETWEEN 1 AND 40),
  periodo           SMALLINT    NOT NULL CHECK (periodo BETWEEN 1 AND 12),
  semestre          TEXT        NOT NULL CHECK (semestre ~ '^[0-9]{4}\.[12]$'),
  data_prova        DATE,
  -- Opcional: sem título a UI monta "N2 · 3º período".
  titulo            TEXT        CHECK (titulo IS NULL OR length(btrim(titulo)) BETWEEN 1 AND 120),
  observacao        TEXT        CHECK (observacao IS NULL OR length(observacao) <= 600),
  qtd_alternativas  SMALLINT    NOT NULL DEFAULT 5 CHECK (qtd_alternativas BETWEEN 2 AND 5),
  status            TEXT        NOT NULL DEFAULT 'rascunho'
                                CHECK (status IN ('rascunho', 'publicado')),
  -- Marcado pela equipe depois que o gabarito oficial sai e bate com este.
  conferido_oficial BOOLEAN     NOT NULL DEFAULT false,
  publicado_em      TIMESTAMPTZ,
  -- Notificação in-app aos alunos do período sai uma vez só por gabarito
  -- (só é marcada quando ao menos um aluno recebeu).
  notificado_em     TIMESTAMPTZ,
  visualizacoes     INT         NOT NULL DEFAULT 0 CHECK (visualizacoes >= 0),
  criado_por        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gabarito_prova ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS gabarito_prova_publicado_idx
  ON public.gabarito_prova (periodo, publicado_em DESC) WHERE status = 'publicado';

CREATE INDEX IF NOT EXISTS gabarito_prova_criado_por_idx
  ON public.gabarito_prova (criado_por);

-- ─── Tabela: gabarito_prova_questao ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gabarito_prova_questao (
  gabarito_id UUID     NOT NULL REFERENCES public.gabarito_prova(id) ON DELETE CASCADE,
  numero      SMALLINT NOT NULL CHECK (numero BETWEEN 1 AND 200),
  -- NULL e não anulada = "em análise" (a equipe ainda não fechou a letra).
  resposta    TEXT     CHECK (resposta IS NULL OR resposta IN ('A', 'B', 'C', 'D', 'E')),
  anulada     BOOLEAN  NOT NULL DEFAULT false,
  -- Disciplina/área da questão, opcional (ex.: "SOI", "Anatomia").
  area        TEXT     CHECK (area IS NULL OR length(btrim(area)) BETWEEN 1 AND 60),
  comentario  TEXT     CHECK (comentario IS NULL OR length(comentario) <= 1000),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gabarito_id, numero),
  CONSTRAINT gabarito_prova_questao_anulada_sem_letra CHECK (NOT (anulada AND resposta IS NOT NULL))
);

ALTER TABLE public.gabarito_prova_questao ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS (admin-only; o público lê pelas RPCs abaixo)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "banidos_bloqueados" ON public.gabarito_prova;
CREATE POLICY "banidos_bloqueados"
  ON public.gabarito_prova AS RESTRICTIVE TO authenticated
  USING (NOT public.is_banned()) WITH CHECK (NOT public.is_banned());

DROP POLICY IF EXISTS "gabarito_prova_admin_select" ON public.gabarito_prova;
CREATE POLICY "gabarito_prova_admin_select"
  ON public.gabarito_prova FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "banidos_bloqueados" ON public.gabarito_prova_questao;
CREATE POLICY "banidos_bloqueados"
  ON public.gabarito_prova_questao AS RESTRICTIVE TO authenticated
  USING (NOT public.is_banned()) WITH CHECK (NOT public.is_banned());

DROP POLICY IF EXISTS "gabarito_prova_questao_admin_select" ON public.gabarito_prova_questao;
CREATE POLICY "gabarito_prova_questao_admin_select"
  ON public.gabarito_prova_questao FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE ALL ON public.gabarito_prova         FROM anon, authenticated;
REVOKE ALL ON public.gabarito_prova_questao FROM anon, authenticated;
GRANT SELECT         ON public.gabarito_prova         TO authenticated;
GRANT SELECT         ON public.gabarito_prova_questao TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Helpers
-- ════════════════════════════════════════════════════════════════════════════

-- Slug legível: "N2" + 3 + "2026.2" → "n2-3-periodo-2026-2" (com sufixo -2, -3…
-- em caso de colisão, ex.: duas versões da mesma prova).
CREATE OR REPLACE FUNCTION public.gerar_slug_gabarito_prova(
  p_tipo_prova TEXT, p_periodo INT, p_semestre TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
  v_n    INT := 1;
BEGIN
  v_base := lower(extensions.unaccent(p_tipo_prova));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  IF v_base = '' THEN v_base := 'prova'; END IF;
  v_base := left(v_base, 40) || '-' || p_periodo || '-periodo-' || replace(p_semestre, '.', '-');
  v_base := btrim(v_base, '-');
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.gabarito_prova WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_slug_gabarito_prova(TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs públicas (anon + authenticated)
-- ════════════════════════════════════════════════════════════════════════════

-- Lista dos publicados, mais recentes primeiro. Filtro de período opcional.
CREATE OR REPLACE FUNCTION public.listar_gabaritos_provas(p_periodo INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.publicado_em DESC), '[]'::jsonb)
  FROM (
    SELECT g.id, g.slug, g.titulo, g.tipo_prova, g.periodo, g.semestre, g.data_prova,
           g.qtd_alternativas, g.conferido_oficial, g.publicado_em, g.atualizado_em,
           g.visualizacoes,
           (SELECT count(*) FROM public.gabarito_prova_questao q WHERE q.gabarito_id = g.id)::int AS total_questoes,
           (SELECT count(*) FROM public.gabarito_prova_questao q
             WHERE q.gabarito_id = g.id AND q.anulada)::int AS total_anuladas
    FROM public.gabarito_prova g
    WHERE g.status = 'publicado'
      AND (p_periodo IS NULL OR g.periodo = p_periodo)
    ORDER BY g.publicado_em DESC
    LIMIT 200
  ) t;
$$;

-- Um gabarito com as questões. Publicado para todos; rascunho só para admin
-- (pré-visualização no editor).
CREATE OR REPLACE FUNCTION public.get_gabarito_prova(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', g.id,
    'slug', g.slug,
    'titulo', g.titulo,
    'tipo_prova', g.tipo_prova,
    'periodo', g.periodo,
    'semestre', g.semestre,
    'data_prova', g.data_prova,
    'observacao', g.observacao,
    'qtd_alternativas', g.qtd_alternativas,
    'status', g.status,
    'conferido_oficial', g.conferido_oficial,
    'publicado_em', g.publicado_em,
    'atualizado_em', g.atualizado_em,
    'visualizacoes', g.visualizacoes,
    'questoes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'numero', q.numero,
        'resposta', q.resposta,
        'anulada', q.anulada,
        'area', q.area,
        'comentario', q.comentario
      ) ORDER BY q.numero), '[]'::jsonb)
      FROM public.gabarito_prova_questao q WHERE q.gabarito_id = g.id
    )
  )
  FROM public.gabarito_prova g
  WHERE g.slug = p_slug
    AND (g.status = 'publicado' OR public.is_admin());
$$;

-- Contador de visualizações (métrica de engajamento para o admin). Só conta
-- publicados; não exige login. Sem dado pessoal gravado.
CREATE OR REPLACE FUNCTION public.registrar_visualizacao_gabarito_prova(p_slug TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.gabarito_prova
     SET visualizacoes = visualizacoes + 1
   WHERE slug = p_slug AND status = 'publicado';
$$;

-- Vitrine pública: o que a página de convite ao cadastro mostra. Nenhuma letra,
-- nenhum comentário, só contagens. Rascunho não existe para ela.
CREATE OR REPLACE FUNCTION public.get_gabarito_prova_vitrine(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', g.id,
    'slug', g.slug,
    'titulo', g.titulo,
    'tipo_prova', g.tipo_prova,
    'periodo', g.periodo,
    'semestre', g.semestre,
    'data_prova', g.data_prova,
    'qtd_alternativas', g.qtd_alternativas,
    'conferido_oficial', g.conferido_oficial,
    'publicado_em', g.publicado_em,
    'atualizado_em', g.atualizado_em,
    'visualizacoes', g.visualizacoes,
    'total_questoes', (SELECT count(*) FROM public.gabarito_prova_questao q WHERE q.gabarito_id = g.id),
    'total_anuladas', (SELECT count(*) FROM public.gabarito_prova_questao q WHERE q.gabarito_id = g.id AND q.anulada),
    'total_comentadas', (SELECT count(*) FROM public.gabarito_prova_questao q WHERE q.gabarito_id = g.id AND q.comentario IS NOT NULL)
  )
  FROM public.gabarito_prova g
  WHERE g.slug = p_slug AND g.status = 'publicado';
$$;

REVOKE ALL ON FUNCTION public.get_gabarito_prova_vitrine(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gabarito_prova_vitrine(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.listar_gabaritos_provas(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_gabarito_prova(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_visualizacao_gabarito_prova(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_gabaritos_provas(INT) TO anon, authenticated;
-- Respostas só para quem tem conta (ver cabeçalho).
REVOKE ALL ON FUNCTION public.get_gabarito_prova(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_gabarito_prova(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_visualizacao_gabarito_prova(TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs de admin
-- ════════════════════════════════════════════════════════════════════════════

-- admin_listar_gabaritos_provas(): definida no fim do arquivo (inclui o estado do e-mail).

-- Cria ou atualiza o gabarito inteiro numa transação (cabeçalho + questões).
-- Payload:
--   { id?, tipo_prova, periodo, semestre, data_prova?, titulo?, observacao?,
--     qtd_alternativas, conferido_oficial?,
--     questoes: [{ numero, resposta?, anulada?, area?, comentario? }] }
-- As questões são substituídas por completo (o editor sempre manda a folha
-- inteira). Retorna { id, slug }.
CREATE OR REPLACE FUNCTION public.admin_salvar_gabarito_prova(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id          UUID := NULLIF(p_payload->>'id', '')::uuid;
  v_tipo        TEXT := NULLIF(btrim(p_payload->>'tipo_prova'), '');
  v_periodo     INT  := (p_payload->>'periodo')::int;
  v_semestre    TEXT := btrim(p_payload->>'semestre');
  v_qtd_alt     INT  := COALESCE((p_payload->>'qtd_alternativas')::int, 5);
  v_questoes    JSONB := COALESCE(p_payload->'questoes', '[]'::jsonb);
  v_letras      TEXT[];
  v_slug        TEXT;
  v_total       INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'tipo_prova_obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  IF v_periodo IS NULL OR v_periodo NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF v_semestre IS NULL OR v_semestre !~ '^[0-9]{4}\.[12]$' THEN
    RAISE EXCEPTION 'semestre_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF v_qtd_alt NOT BETWEEN 2 AND 5 THEN
    RAISE EXCEPTION 'qtd_alternativas_invalida' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(v_questoes) <> 'array' THEN
    RAISE EXCEPTION 'questoes_invalidas' USING ERRCODE = 'P0001';
  END IF;

  v_total := jsonb_array_length(v_questoes);
  IF v_total = 0 OR v_total > 200 THEN
    RAISE EXCEPTION 'quantidade_questoes_invalida' USING ERRCODE = 'P0001';
  END IF;

  -- Numeração contínua 1..N, sem repetição.
  IF (SELECT count(DISTINCT (q->>'numero')::int) FROM jsonb_array_elements(v_questoes) q) <> v_total
     OR (SELECT min((q->>'numero')::int) FROM jsonb_array_elements(v_questoes) q) <> 1
     OR (SELECT max((q->>'numero')::int) FROM jsonb_array_elements(v_questoes) q) <> v_total THEN
    RAISE EXCEPTION 'numeracao_invalida' USING ERRCODE = 'P0001';
  END IF;

  -- Letra precisa caber na quantidade de alternativas da prova (A–D ou A–E).
  v_letras := (ARRAY['A', 'B', 'C', 'D', 'E'])[1:v_qtd_alt];
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_questoes) q
    WHERE NULLIF(q->>'resposta', '') IS NOT NULL
      AND NOT (upper(q->>'resposta') = ANY (v_letras))
  ) THEN
    RAISE EXCEPTION 'resposta_fora_das_alternativas' USING ERRCODE = 'P0001';
  END IF;

  IF v_id IS NULL THEN
    v_slug := public.gerar_slug_gabarito_prova(v_tipo, v_periodo, v_semestre);
    INSERT INTO public.gabarito_prova (
      slug, tipo_prova, periodo, semestre, data_prova, titulo, observacao,
      qtd_alternativas, conferido_oficial, criado_por
    ) VALUES (
      v_slug, v_tipo, v_periodo, v_semestre,
      NULLIF(p_payload->>'data_prova', '')::date,
      NULLIF(btrim(p_payload->>'titulo'), ''),
      NULLIF(btrim(p_payload->>'observacao'), ''),
      v_qtd_alt,
      COALESCE((p_payload->>'conferido_oficial')::boolean, false),
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.gabarito_prova SET
      tipo_prova        = v_tipo,
      periodo           = v_periodo,
      semestre          = v_semestre,
      data_prova        = NULLIF(p_payload->>'data_prova', '')::date,
      titulo            = NULLIF(btrim(p_payload->>'titulo'), ''),
      observacao        = NULLIF(btrim(p_payload->>'observacao'), ''),
      qtd_alternativas  = v_qtd_alt,
      conferido_oficial = COALESCE((p_payload->>'conferido_oficial')::boolean, false),
      atualizado_em     = now()
    WHERE id = v_id
    RETURNING slug INTO v_slug;

    IF v_slug IS NULL THEN
      RAISE EXCEPTION 'gabarito_nao_encontrado' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.gabarito_prova_questao WHERE gabarito_id = v_id;
  END IF;

  INSERT INTO public.gabarito_prova_questao (gabarito_id, numero, resposta, anulada, area, comentario)
  SELECT v_id,
         (q->>'numero')::int,
         CASE WHEN COALESCE((q->>'anulada')::boolean, false) THEN NULL
              ELSE NULLIF(upper(q->>'resposta'), '') END,
         COALESCE((q->>'anulada')::boolean, false),
         NULLIF(btrim(q->>'area'), ''),
         NULLIF(btrim(q->>'comentario'), '')
  FROM jsonb_array_elements(v_questoes) q;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
END;
$$;

-- Publica/despublica. Na publicação, opcionalmente notifica (in-app) os alunos
-- do período do gabarito — uma única vez por gabarito (`notificado_em`).
-- Chamar de novo com p_publicar = true e p_notificar = true num gabarito já
-- publicado e ainda não avisado é o "Avisar alunos agora" do editor.
-- Retorna { status, publicado_em, notificados, notificado_em }.
CREATE OR REPLACE FUNCTION public.admin_publicar_gabarito_prova(
  p_id UUID, p_publicar BOOLEAN, p_notificar BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_g           public.gabarito_prova%ROWTYPE;
  v_notificados INT := 0;
  v_nome        TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_g FROM public.gabarito_prova WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gabarito_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_publicar THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.gabarito_prova_questao q
      WHERE q.gabarito_id = p_id AND (q.resposta IS NOT NULL OR q.anulada)
    ) THEN
      RAISE EXCEPTION 'gabarito_vazio' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.gabarito_prova
       SET status = 'publicado',
           -- Republicar não "renova" a data: a lista pública ordena por ela e
           -- o selo "novo" não deve voltar por uma correção de letra.
           publicado_em = COALESCE(publicado_em, now()),
           atualizado_em = now()
     WHERE id = p_id
     RETURNING * INTO v_g;

    IF p_notificar AND v_g.notificado_em IS NULL THEN
      v_nome := COALESCE(v_g.titulo, v_g.tipo_prova || ' · ' || v_g.periodo || 'º período');
      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, dados)
      SELECT pr.id, 'info',
             'Saiu o gabarito extraoficial: ' || v_nome,
             'Confira as respostas e calcule sua nota agora.',
             jsonb_build_object('link', '/dashboard/gabaritos/' || v_g.slug)
      FROM public.profiles pr
      JOIN auth.users u ON u.id = pr.id
      WHERE pr.papel = 'aluno'
        AND pr.banido = false
        AND pr.periodo = v_g.periodo
        AND u.email_confirmed_at IS NOT NULL
        AND u.deleted_at IS NULL;
      GET DIAGNOSTICS v_notificados = ROW_COUNT;

      -- Só "gasta" o aviso se alguém recebeu: publicar antes de existir aluno
      -- daquele período não pode impedir o aviso quando eles chegarem.
      IF v_notificados > 0 THEN
        UPDATE public.gabarito_prova SET notificado_em = now() WHERE id = p_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.gabarito_prova
       SET status = 'rascunho', atualizado_em = now()
     WHERE id = p_id
     RETURNING * INTO v_g;
  END IF;

  RETURN jsonb_build_object(
    'status', v_g.status,
    'publicado_em', v_g.publicado_em,
    'notificados', v_notificados,
    'notificado_em', (SELECT notificado_em FROM public.gabarito_prova WHERE id = p_id)
  );
END;
$$;

-- Exclusão definitiva (cascata nas questões). RPC em vez de DELETE direto para
-- falhar alto quando não acha a linha, em vez de "0 linhas" silencioso.
CREATE OR REPLACE FUNCTION public.admin_excluir_gabarito_prova(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.gabarito_prova WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gabarito_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_excluir_gabarito_prova(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_excluir_gabarito_prova(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_salvar_gabarito_prova(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_publicar_gabarito_prova(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_gabarito_prova(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_publicar_gabarito_prova(UUID, BOOLEAN, BOOLEAN) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Selo de novidade na sidebar do app
-- ════════════════════════════════════════════════════════════════════════════

-- Momento da publicação mais recente. A sidebar mostra o selo de novidade
-- quando foi há menos de 24h (decisão no cliente).
CREATE OR REPLACE FUNCTION public.ultimo_gabarito_publicado_em()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT max(publicado_em) FROM public.gabarito_prova WHERE status = 'publicado';
$$;

REVOKE ALL ON FUNCTION public.ultimo_gabarito_publicado_em() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ultimo_gabarito_publicado_em() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Aviso por e-mail (reaproveita a tubulação de campanhas: Resend, log por
-- destinatário, descadastro, "Retomar" no /admin/campanhas)
-- ════════════════════════════════════════════════════════════════════════════

-- A campanha de um gabarito usa o segmento próprio 'gabarito' e aponta para ele.
-- No máximo UMA campanha por gabarito: é a trava de idempotência do disparo.
ALTER TABLE public.email_campanha DROP CONSTRAINT IF EXISTS email_campanha_segmento_check;
ALTER TABLE public.email_campanha ADD CONSTRAINT email_campanha_segmento_check
  CHECK (segmento = ANY (ARRAY['sem_assinatura_ativa', 'nunca_assinou', 'ex_assinantes', 'todos', 'lista_manual', 'gabarito']));

ALTER TABLE public.email_campanha
  ADD COLUMN IF NOT EXISTS gabarito_id UUID REFERENCES public.gabarito_prova(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_campanha_gabarito_unico_idx
  ON public.email_campanha (gabarito_id) WHERE gabarito_id IS NOT NULL;

-- Público do e-mail de um gabarito: alunos do período da prova, com as mesmas
-- exclusões das campanhas (admin, banido, descadastrado, e-mail não
-- confirmado). Teto de `p_limite` (50 por padrão: cota diária do Resend). A
-- prioridade é quem está FORA de Ipatinga, porque lá a notícia já corre pelos
-- grupos da turma. Dentro de cada grupo, quem entrou por último no app vem
-- antes. Quem passar do teto não recebe e-mail, só a notificação no app.
-- Só a edge function (service_role) chama.
CREATE OR REPLACE FUNCTION public.email_publico_gabarito(p_gabarito_id UUID, p_limite INT DEFAULT 50)
RETURNS TABLE(user_id UUID, email TEXT, nome_completo TEXT, email_token UUID, criado_em TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id, p.email, p.nome_completo, p.email_token, p.criado_em
  FROM public.gabarito_prova g
  JOIN public.profiles p ON p.periodo = g.periodo
  JOIN auth.users u ON u.id = p.id
  WHERE g.id = p_gabarito_id
    AND g.status = 'publicado'
    AND p.papel = 'aluno'
    AND p.banido = false
    AND p.email_marketing_optout = false
    AND p.email IS NOT NULL
    AND p.email <> ''
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
  ORDER BY (p.faculdade_unidade IS NOT DISTINCT FROM 'ipatinga_mg'),
           u.last_sign_in_at DESC NULLS LAST,
           p.criado_em
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 0), 50);
$$;

REVOKE ALL ON FUNCTION public.email_publico_gabarito(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_publico_gabarito(UUID, INT) TO service_role;

-- Lista do admin (inclui o estado do e-mail do gabarito).
CREATE OR REPLACE FUNCTION public.admin_listar_gabaritos_provas()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.criado_em DESC), '[]'::jsonb)
    FROM (
      SELECT g.id, g.slug, g.titulo, g.tipo_prova, g.periodo, g.semestre, g.data_prova,
             g.qtd_alternativas, g.status, g.conferido_oficial, g.publicado_em,
             g.notificado_em, g.visualizacoes, g.criado_em, g.atualizado_em,
             (SELECT count(*) FROM public.gabarito_prova_questao q WHERE q.gabarito_id = g.id)::int AS total_questoes,
             (SELECT count(*) FROM public.gabarito_prova_questao q
               WHERE q.gabarito_id = g.id AND (q.resposta IS NOT NULL OR q.anulada))::int AS total_preenchidas,
             c.id AS email_campanha_id,
             c.status AS email_status,
             COALESCE(c.total_enviados, 0) AS email_enviados
      FROM public.gabarito_prova g
      LEFT JOIN public.email_campanha c ON c.gabarito_id = g.id
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_listar_gabaritos_provas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_gabaritos_provas() TO authenticated;
