-- ════════════════════════════════════════════════════════════════════════════
-- Gabaritos extraoficiais: CADERNOS de prova
--
-- Uma mesma prova (ex.: N1 2026.2 do 3º período) costuma ter vários cadernos
-- (versões A/B/C, ou Azul/Verde/Amarelo) com as MESMAS questões em ordem
-- diferente, logo cada caderno tem o seu próprio gabarito. Agora um gabarito
-- (cabeçalho) tem 1..12 cadernos, cada um com nome e folha de respostas próprios.
--
--   gabarito_prova           → cabeçalho (inalterado)
--   gabarito_prova_caderno   → NOVO: 1 linha por caderno (nome, slug, ordem)
--   gabarito_prova_questao   → passa a pertencer a um caderno (PK = caderno_id + numero)
--
-- Dados existentes: cada gabarito já publicado vira 1 caderno "Caderno único",
-- sem mudar link, slug, respostas nem notificações. A UI esconde o seletor de
-- caderno quando só há um.
--
-- Compatibilidade durante o deploy (banco sobe ANTES do frontend):
--   * `get_gabarito_prova` continua devolvendo `questoes` (= folha do 1º caderno)
--     além de `cadernos`; o front antigo segue funcionando até a Vercel publicar.
--   * `admin_salvar_gabarito_prova` aceita o payload antigo (`questoes` na raiz)
--     quando o gabarito tem um caderno só.
--
-- ⚠️ Migration escrita à mão e testada local (não regenerar via db pull: o
-- autogerado re-emite grants default e reabre as tabelas para `anon`).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tabela: gabarito_prova_caderno ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gabarito_prova_caderno (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gabarito_id UUID        NOT NULL REFERENCES public.gabarito_prova(id) ON DELETE CASCADE,
  -- Identificador do caderno dentro do gabarito (?caderno=<slug> no link).
  -- Gerado na criação e NUNCA reescrito, como o slug do gabarito: renomear o
  -- caderno não quebra link que já circulou.
  slug        TEXT        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 40),
  -- O que está impresso na capa: "Azul", "Caderno B", "Versão 2"…
  nome        TEXT        NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 40),
  ordem       SMALLINT    NOT NULL CHECK (ordem BETWEEN 1 AND 20),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gabarito_id, slug),
  -- Alvo da FK composta de gabarito_prova_questao (garante que a questão e o
  -- caderno pertencem ao MESMO gabarito).
  UNIQUE (gabarito_id, id)
);

ALTER TABLE public.gabarito_prova_caderno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "banidos_bloqueados" ON public.gabarito_prova_caderno;
CREATE POLICY "banidos_bloqueados"
  ON public.gabarito_prova_caderno AS RESTRICTIVE TO authenticated
  USING (NOT public.is_banned()) WITH CHECK (NOT public.is_banned());

DROP POLICY IF EXISTS "gabarito_prova_caderno_admin_select" ON public.gabarito_prova_caderno;
CREATE POLICY "gabarito_prova_caderno_admin_select"
  ON public.gabarito_prova_caderno FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE ALL ON public.gabarito_prova_caderno FROM anon, authenticated;
GRANT SELECT ON public.gabarito_prova_caderno TO authenticated;

-- ─── Dados existentes: 1 caderno por gabarito ───────────────────────────────
INSERT INTO public.gabarito_prova_caderno (gabarito_id, slug, nome, ordem)
SELECT g.id, 'unico', 'Caderno único', 1
FROM public.gabarito_prova g
WHERE NOT EXISTS (SELECT 1 FROM public.gabarito_prova_caderno c WHERE c.gabarito_id = g.id);

-- ─── gabarito_prova_questao passa a pertencer a um caderno ──────────────────
ALTER TABLE public.gabarito_prova_questao ADD COLUMN IF NOT EXISTS caderno_id UUID;

UPDATE public.gabarito_prova_questao q
   SET caderno_id = c.id
  FROM public.gabarito_prova_caderno c
 WHERE c.gabarito_id = q.gabarito_id AND q.caderno_id IS NULL;

ALTER TABLE public.gabarito_prova_questao ALTER COLUMN caderno_id SET NOT NULL;

ALTER TABLE public.gabarito_prova_questao DROP CONSTRAINT IF EXISTS gabarito_prova_questao_pkey;
ALTER TABLE public.gabarito_prova_questao ADD PRIMARY KEY (caderno_id, numero);

ALTER TABLE public.gabarito_prova_questao
  ADD CONSTRAINT gabarito_prova_questao_caderno_fk
  FOREIGN KEY (gabarito_id, caderno_id)
  REFERENCES public.gabarito_prova_caderno (gabarito_id, id) ON DELETE CASCADE;

-- A PK antiga (gabarito_id, numero) cobria a FK para gabarito_prova.
CREATE INDEX IF NOT EXISTS gabarito_prova_questao_gabarito_idx
  ON public.gabarito_prova_questao (gabarito_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Helpers (internos: ninguém chama direto)
-- ════════════════════════════════════════════════════════════════════════════

-- "Azul" → azul · "Caderno B" → caderno-b · colisão → caderno-b-2.
CREATE OR REPLACE FUNCTION public.gerar_slug_gabarito_caderno(p_gabarito_id UUID, p_nome TEXT)
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
  v_base := lower(extensions.unaccent(p_nome));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(left(btrim(v_base, '-'), 30), '-');
  IF v_base = '' THEN v_base := 'caderno'; END IF;
  v_slug := v_base;
  WHILE EXISTS (
    SELECT 1 FROM public.gabarito_prova_caderno WHERE gabarito_id = p_gabarito_id AND slug = v_slug
  ) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_slug_gabarito_caderno(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Folha de um caderno em JSON (só chamada de dentro das RPCs SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.gabarito_questoes_json(p_caderno_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'numero', q.numero,
    'resposta', q.resposta,
    'anulada', q.anulada,
    'area', q.area,
    'comentario', q.comentario
  ) ORDER BY q.numero), '[]'::jsonb)
  FROM public.gabarito_prova_questao q
  WHERE q.caderno_id = p_caderno_id;
$$;

REVOKE ALL ON FUNCTION public.gabarito_questoes_json(UUID) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs públicas
-- ════════════════════════════════════════════════════════════════════════════

-- Lista dos publicados. `total_questoes` = questões POR caderno (o que o aluno
-- vê: "40 questões"); `cadernos` traz os nomes para o card.
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
           COALESCE((SELECT max(x.total) FROM (
             SELECT count(*) AS total FROM public.gabarito_prova_questao q
              WHERE q.gabarito_id = g.id GROUP BY q.caderno_id) x), 0)::int AS total_questoes,
           COALESCE((SELECT max(x.total) FROM (
             SELECT count(*) AS total FROM public.gabarito_prova_questao q
              WHERE q.gabarito_id = g.id AND q.anulada GROUP BY q.caderno_id) x), 0)::int AS total_anuladas,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'id', c.id, 'slug', c.slug, 'nome', c.nome, 'ordem', c.ordem
                   ) ORDER BY c.ordem), '[]'::jsonb)
              FROM public.gabarito_prova_caderno c WHERE c.gabarito_id = g.id) AS cadernos
    FROM public.gabarito_prova g
    WHERE g.status = 'publicado'
      AND (p_periodo IS NULL OR g.periodo = p_periodo)
    ORDER BY g.publicado_em DESC
    LIMIT 200
  ) t;
$$;

-- Um gabarito com os cadernos e suas folhas. Publicado para quem tem conta;
-- rascunho só para admin. `questoes` (raiz) = folha do 1º caderno, só por
-- compatibilidade com o front anterior ao deploy (remover depois).
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
    'cadernos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'nome', c.nome,
        'ordem', c.ordem,
        'questoes', public.gabarito_questoes_json(c.id)
      ) ORDER BY c.ordem), '[]'::jsonb)
      FROM public.gabarito_prova_caderno c WHERE c.gabarito_id = g.id
    ),
    'questoes', (
      SELECT public.gabarito_questoes_json(c.id)
      FROM public.gabarito_prova_caderno c
      WHERE c.gabarito_id = g.id
      ORDER BY c.ordem LIMIT 1
    )
  )
  FROM public.gabarito_prova g
  WHERE g.slug = p_slug
    AND (g.status = 'publicado' OR public.is_admin());
$$;

-- Vitrine pública: nenhuma letra nem comentário, só contagens e os nomes dos
-- cadernos (o visitante vê que existem "Azul, Verde, Amarelo").
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
    'total_questoes', COALESCE((SELECT max(x.total) FROM (
       SELECT count(*) AS total FROM public.gabarito_prova_questao q
        WHERE q.gabarito_id = g.id GROUP BY q.caderno_id) x), 0),
    'total_anuladas', COALESCE((SELECT max(x.total) FROM (
       SELECT count(*) AS total FROM public.gabarito_prova_questao q
        WHERE q.gabarito_id = g.id AND q.anulada GROUP BY q.caderno_id) x), 0),
    'total_comentadas', COALESCE((SELECT max(x.total) FROM (
       SELECT count(*) AS total FROM public.gabarito_prova_questao q
        WHERE q.gabarito_id = g.id AND q.comentario IS NOT NULL GROUP BY q.caderno_id) x), 0),
    'cadernos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'nome', c.nome, 'ordem', c.ordem
      ) ORDER BY c.ordem), '[]'::jsonb)
      FROM public.gabarito_prova_caderno c WHERE c.gabarito_id = g.id
    )
  )
  FROM public.gabarito_prova g
  WHERE g.slug = p_slug AND g.status = 'publicado';
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs de admin
-- ════════════════════════════════════════════════════════════════════════════

-- Cria ou atualiza o gabarito inteiro numa transação (cabeçalho + cadernos +
-- folhas). Payload:
--   { id?, tipo_prova, periodo, semestre, data_prova?, titulo?, observacao?,
--     qtd_alternativas, conferido_oficial?,
--     cadernos: [{ id?, nome, questoes: [{ numero, resposta?, anulada?, area?, comentario? }] }] }
-- O editor sempre manda TODOS os cadernos: o que não vier (por id) é excluído
-- com a folha, e as questões de cada caderno são substituídas por completo.
-- Todos os cadernos têm o mesmo nº de questões (a mesma prova, em ordens diferentes).
-- Payload legado: `questoes` na raiz = caderno único.
-- Retorna { id, slug, cadernos: [{ id, slug, nome, ordem }] }.
CREATE OR REPLACE FUNCTION public.admin_salvar_gabarito_prova(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id        UUID := NULLIF(p_payload->>'id', '')::uuid;
  v_tipo      TEXT := NULLIF(btrim(p_payload->>'tipo_prova'), '');
  v_periodo   INT  := (p_payload->>'periodo')::int;
  v_semestre  TEXT := btrim(p_payload->>'semestre');
  v_qtd_alt   INT  := COALESCE((p_payload->>'qtd_alternativas')::int, 5);
  v_cadernos  JSONB;
  v_cad       JSONB;
  v_questoes  JSONB;
  v_letras    TEXT[];
  v_slug      TEXT;
  v_total     INT;
  v_total_ref INT;
  v_qtd_cad   INT;
  v_nome      TEXT;
  v_cad_id    UUID;
  v_cad_slug  TEXT;
  v_ordem     INT := 0;
  v_saida     JSONB := '[]'::jsonb;
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

  -- Normaliza para a lista de cadernos.
  IF jsonb_typeof(p_payload->'cadernos') = 'array' THEN
    v_cadernos := p_payload->'cadernos';
  ELSIF jsonb_typeof(p_payload->'questoes') = 'array' THEN
    IF v_id IS NOT NULL THEN
      SELECT count(*) INTO v_qtd_cad FROM public.gabarito_prova_caderno WHERE gabarito_id = v_id;
      IF v_qtd_cad > 1 THEN
        RAISE EXCEPTION 'cadernos_obrigatorio' USING ERRCODE = 'P0001';
      END IF;
      SELECT jsonb_build_array(jsonb_build_object('id', c.id, 'nome', c.nome, 'questoes', p_payload->'questoes'))
        INTO v_cadernos
        FROM public.gabarito_prova_caderno c WHERE c.gabarito_id = v_id;
    END IF;
    v_cadernos := COALESCE(
      v_cadernos,
      jsonb_build_array(jsonb_build_object('nome', 'Caderno único', 'questoes', p_payload->'questoes'))
    );
  ELSE
    RAISE EXCEPTION 'questoes_invalidas' USING ERRCODE = 'P0001';
  END IF;

  v_qtd_cad := jsonb_array_length(v_cadernos);
  IF v_qtd_cad < 1 OR v_qtd_cad > 12 THEN
    RAISE EXCEPTION 'quantidade_cadernos_invalida' USING ERRCODE = 'P0001';
  END IF;

  -- Nomes: obrigatórios (até 40) e sem repetir (ignora caixa e espaços).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cadernos) c
    WHERE NULLIF(btrim(c->>'nome'), '') IS NULL OR length(btrim(c->>'nome')) > 40
  ) THEN
    RAISE EXCEPTION 'nome_caderno_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT lower(btrim(c->>'nome'))) FROM jsonb_array_elements(v_cadernos) c) <> v_qtd_cad THEN
    RAISE EXCEPTION 'nome_caderno_repetido' USING ERRCODE = 'P0001';
  END IF;

  v_letras := (ARRAY['A', 'B', 'C', 'D', 'E'])[1:v_qtd_alt];

  -- Valida a folha de cada caderno ANTES de gravar qualquer coisa.
  FOR v_cad IN SELECT value FROM jsonb_array_elements(v_cadernos) LOOP
    v_questoes := v_cad->'questoes';
    IF jsonb_typeof(v_questoes) <> 'array' THEN
      RAISE EXCEPTION 'questoes_invalidas' USING ERRCODE = 'P0001';
    END IF;

    v_total := jsonb_array_length(v_questoes);
    IF v_total = 0 OR v_total > 200 THEN
      RAISE EXCEPTION 'quantidade_questoes_invalida' USING ERRCODE = 'P0001';
    END IF;
    IF v_total_ref IS NULL THEN
      v_total_ref := v_total;
    ELSIF v_total <> v_total_ref THEN
      RAISE EXCEPTION 'cadernos_tamanhos_diferentes' USING ERRCODE = 'P0001';
    END IF;

    -- Numeração contínua 1..N, sem repetição.
    IF (SELECT count(DISTINCT (q->>'numero')::int) FROM jsonb_array_elements(v_questoes) q) <> v_total
       OR (SELECT min((q->>'numero')::int) FROM jsonb_array_elements(v_questoes) q) <> 1
       OR (SELECT max((q->>'numero')::int) FROM jsonb_array_elements(v_questoes) q) <> v_total THEN
      RAISE EXCEPTION 'numeracao_invalida' USING ERRCODE = 'P0001';
    END IF;

    -- Letra precisa caber na quantidade de alternativas da prova (A–D ou A–E).
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_questoes) q
      WHERE NULLIF(q->>'resposta', '') IS NOT NULL
        AND NOT (upper(q->>'resposta') = ANY (v_letras))
    ) THEN
      RAISE EXCEPTION 'resposta_fora_das_alternativas' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Cadernos existentes citados no payload precisam ser DESTE gabarito.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cadernos) c
    WHERE NULLIF(c->>'id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.gabarito_prova_caderno x
        WHERE x.id = (c->>'id')::uuid AND x.gabarito_id = v_id
      )
  ) THEN
    RAISE EXCEPTION 'caderno_invalido' USING ERRCODE = 'P0001';
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

    -- Folhas são substituídas por completo; cadernos fora do payload saem.
    DELETE FROM public.gabarito_prova_questao WHERE gabarito_id = v_id;
    DELETE FROM public.gabarito_prova_caderno
     WHERE gabarito_id = v_id
       AND id NOT IN (
         SELECT (c->>'id')::uuid FROM jsonb_array_elements(v_cadernos) c
          WHERE NULLIF(c->>'id', '') IS NOT NULL
       );
  END IF;

  FOR v_cad IN SELECT value FROM jsonb_array_elements(v_cadernos) LOOP
    v_ordem  := v_ordem + 1;
    v_nome   := btrim(v_cad->>'nome');
    v_cad_id := NULLIF(v_cad->>'id', '')::uuid;

    IF v_cad_id IS NULL THEN
      INSERT INTO public.gabarito_prova_caderno (gabarito_id, slug, nome, ordem)
      VALUES (v_id, public.gerar_slug_gabarito_caderno(v_id, v_nome), v_nome, v_ordem)
      RETURNING id, slug INTO v_cad_id, v_cad_slug;
    ELSE
      UPDATE public.gabarito_prova_caderno
         SET nome = v_nome, ordem = v_ordem
       WHERE id = v_cad_id
      RETURNING slug INTO v_cad_slug;
    END IF;

    INSERT INTO public.gabarito_prova_questao (gabarito_id, caderno_id, numero, resposta, anulada, area, comentario)
    SELECT v_id,
           v_cad_id,
           (q->>'numero')::int,
           CASE WHEN COALESCE((q->>'anulada')::boolean, false) THEN NULL
                ELSE NULLIF(upper(q->>'resposta'), '') END,
           COALESCE((q->>'anulada')::boolean, false),
           NULLIF(btrim(q->>'area'), ''),
           NULLIF(btrim(q->>'comentario'), '')
    FROM jsonb_array_elements(v_cad->'questoes') q;

    v_saida := v_saida || jsonb_build_object('id', v_cad_id, 'slug', v_cad_slug, 'nome', v_nome, 'ordem', v_ordem);
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug, 'cadernos', v_saida);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_salvar_gabarito_prova(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_gabarito_prova(JSONB) TO authenticated;

-- Lista do admin. `total_questoes`/`total_preenchidas` são a SOMA dos cadernos
-- (a barra de progresso do card); o detalhe por caderno vem em `cadernos`.
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
             (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id', cd.id, 'slug', cd.slug, 'nome', cd.nome, 'ordem', cd.ordem,
                       'total_questoes', x.total, 'total_preenchidas', x.preenchidas
                     ) ORDER BY cd.ordem), '[]'::jsonb)
                FROM public.gabarito_prova_caderno cd
                CROSS JOIN LATERAL (
                  SELECT count(*)::int AS total,
                         (count(*) FILTER (WHERE q.resposta IS NOT NULL OR q.anulada))::int AS preenchidas
                    FROM public.gabarito_prova_questao q WHERE q.caderno_id = cd.id
                ) x
               WHERE cd.gabarito_id = g.id) AS cadernos,
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
