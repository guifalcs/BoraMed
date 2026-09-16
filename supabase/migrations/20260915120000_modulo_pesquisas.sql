-- ════════════════════════════════════════════════════════════════════════════
-- Módulo de Pesquisas (surveys in-app)
--
-- Mesma mecânica de entrega dos avisos (modal ao entrar no app, segmentado por
-- nível de acesso), mas com formulário: perguntas de texto, escolha única,
-- múltipla escolha, escala e NPS. Responder NUNCA é obrigatório — o usuário
-- pode dispensar, e a dispensa é permanente por usuário (igual `avisos_vistos`).
--
-- Estrutura:
--   pesquisa                → cabeçalho + segmento + janela de exibição
--   pesquisa_pergunta       → perguntas ordenadas, com tipo
--   pesquisa_opcao          → alternativas das perguntas de escolha
--   pesquisa_resposta       → 1 linha por (pesquisa, usuário) que respondeu
--   pesquisa_resposta_item  → 1 linha por pergunta respondida
--   pesquisa_dispensa       → 1 linha por (pesquisa, usuário) que dispensou
--
-- Regra de integridade dos resultados: assim que a primeira resposta chega, a
-- ESTRUTURA da pesquisa congela (ver `admin_salvar_pesquisa`). Para mudar as
-- perguntas, duplica-se a pesquisa (`admin_duplicar_pesquisa`).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tabela: pesquisa ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT        NOT NULL CHECK (length(btrim(titulo)) > 0),
  descricao     TEXT,
  -- Mesmos valores de `avisos.segmento` (ver public.nivel_no_segmento).
  segmento      TEXT        NOT NULL DEFAULT 'todos'
                            CHECK (segmento IN ('todos','pagantes','gratuitos','essencial','avancado')),
  ativa         BOOLEAN     NOT NULL DEFAULT false,
  -- Opcional: some do app depois desta data mesmo continuando ativa.
  encerra_em    TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pesquisa ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pesquisa_ativa_idx
  ON public.pesquisa (ativa) WHERE ativa = true;

-- ─── Tabela: pesquisa_pergunta ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_pergunta (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id     UUID    NOT NULL REFERENCES public.pesquisa(id) ON DELETE CASCADE,
  ordem           INT     NOT NULL DEFAULT 0,
  tipo            TEXT    NOT NULL
                          CHECK (tipo IN ('texto_curto','texto_longo','escolha_unica','multipla_escolha','escala','nps')),
  enunciado       TEXT    NOT NULL CHECK (length(btrim(enunciado)) > 0),
  ajuda           TEXT,
  obrigatoria     BOOLEAN NOT NULL DEFAULT false,
  -- Só para tipo 'escala'. 'nps' é sempre 0–10, fixo no cliente e na agregação.
  escala_min      INT     NOT NULL DEFAULT 1,
  escala_max      INT     NOT NULL DEFAULT 5,
  escala_min_label TEXT,
  escala_max_label TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pesquisa_pergunta_escala_valida CHECK (escala_max > escala_min AND escala_max - escala_min <= 10)
);

ALTER TABLE public.pesquisa_pergunta ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pesquisa_pergunta_pesquisa_ordem_idx
  ON public.pesquisa_pergunta (pesquisa_id, ordem);

-- ─── Tabela: pesquisa_opcao ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_opcao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta_id UUID NOT NULL REFERENCES public.pesquisa_pergunta(id) ON DELETE CASCADE,
  ordem       INT  NOT NULL DEFAULT 0,
  label       TEXT NOT NULL CHECK (length(btrim(label)) > 0)
);

ALTER TABLE public.pesquisa_opcao ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pesquisa_opcao_pergunta_ordem_idx
  ON public.pesquisa_opcao (pergunta_id, ordem);

-- ─── Tabela: pesquisa_resposta ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_resposta (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id UUID        NOT NULL REFERENCES public.pesquisa(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pesquisa_id, user_id)
);

ALTER TABLE public.pesquisa_resposta ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pesquisa_resposta_user_idx
  ON public.pesquisa_resposta (user_id);

-- ─── Tabela: pesquisa_resposta_item ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_resposta_item (
  id           UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id  UUID   NOT NULL REFERENCES public.pesquisa_resposta(id) ON DELETE CASCADE,
  pergunta_id  UUID   NOT NULL REFERENCES public.pesquisa_pergunta(id) ON DELETE CASCADE,
  valor_texto  TEXT,
  valor_numero INT,
  -- Escolhas marcadas. Array (e não tabela de junção) porque a opção só some
  -- junto com a pergunta, que já cascateia este item — não há órfão possível.
  opcao_ids    UUID[] NOT NULL DEFAULT '{}',
  UNIQUE (resposta_id, pergunta_id)
);

ALTER TABLE public.pesquisa_resposta_item ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pesquisa_resposta_item_pergunta_idx
  ON public.pesquisa_resposta_item (pergunta_id);

-- ─── Tabela: pesquisa_dispensa ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_dispensa (
  pesquisa_id   UUID        NOT NULL REFERENCES public.pesquisa(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispensado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pesquisa_id, user_id)
);

ALTER TABLE public.pesquisa_dispensa ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pesquisa_dispensa_user_idx
  ON public.pesquisa_dispensa (user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════

-- pesquisa: qualquer autenticado enxerga as ativas (o filtro de segmento fica
-- na RPC); admin enxerga tudo, inclusive rascunho.
DROP POLICY IF EXISTS "pesquisa_select" ON public.pesquisa;
CREATE POLICY "pesquisa_select"
  ON public.pesquisa FOR SELECT TO authenticated
  USING (ativa = true OR public.is_admin());

DROP POLICY IF EXISTS "pesquisa_admin_insert" ON public.pesquisa;
CREATE POLICY "pesquisa_admin_insert"
  ON public.pesquisa FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pesquisa_admin_update" ON public.pesquisa;
CREATE POLICY "pesquisa_admin_update"
  ON public.pesquisa FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pesquisa_admin_delete" ON public.pesquisa;
CREATE POLICY "pesquisa_admin_delete"
  ON public.pesquisa FOR DELETE TO authenticated
  USING (public.is_admin());

-- pergunta / opção: leitura acompanha a pesquisa; escrita só via RPC de admin.
DROP POLICY IF EXISTS "pesquisa_pergunta_select" ON public.pesquisa_pergunta;
CREATE POLICY "pesquisa_pergunta_select"
  ON public.pesquisa_pergunta FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pesquisa s
    WHERE s.id = pesquisa_pergunta.pesquisa_id AND (s.ativa = true OR public.is_admin())
  ));

DROP POLICY IF EXISTS "pesquisa_opcao_select" ON public.pesquisa_opcao;
CREATE POLICY "pesquisa_opcao_select"
  ON public.pesquisa_opcao FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pesquisa_pergunta q
    JOIN public.pesquisa s ON s.id = q.pesquisa_id
    WHERE q.id = pesquisa_opcao.pergunta_id AND (s.ativa = true OR public.is_admin())
  ));

-- respostas: o usuário só enxerga as próprias; admin lê tudo (a tela de
-- resultados passa por RPC, mas a policy mantém a intenção explícita).
DROP POLICY IF EXISTS "pesquisa_resposta_select" ON public.pesquisa_resposta;
CREATE POLICY "pesquisa_resposta_select"
  ON public.pesquisa_resposta FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_admin());

DROP POLICY IF EXISTS "pesquisa_resposta_item_select" ON public.pesquisa_resposta_item;
CREATE POLICY "pesquisa_resposta_item_select"
  ON public.pesquisa_resposta_item FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pesquisa_resposta r
    WHERE r.id = pesquisa_resposta_item.resposta_id
      AND ((SELECT auth.uid()) = r.user_id OR public.is_admin())
  ));

-- dispensa: o próprio usuário insere e lê.
DROP POLICY IF EXISTS "pesquisa_dispensa_select_own" ON public.pesquisa_dispensa;
CREATE POLICY "pesquisa_dispensa_select_own"
  ON public.pesquisa_dispensa FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "pesquisa_dispensa_insert_own" ON public.pesquisa_dispensa;
CREATE POLICY "pesquisa_dispensa_insert_own"
  ON public.pesquisa_dispensa FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Nenhuma escrita direta de resposta: só pela RPC `responder_pesquisa`.
REVOKE ALL ON public.pesquisa_resposta      FROM anon;
REVOKE ALL ON public.pesquisa_resposta_item FROM anon;
REVOKE ALL ON public.pesquisa               FROM anon;
REVOKE ALL ON public.pesquisa_pergunta      FROM anon;
REVOKE ALL ON public.pesquisa_opcao         FROM anon;
REVOKE ALL ON public.pesquisa_dispensa      FROM anon;

GRANT SELECT                 ON public.pesquisa_resposta      TO authenticated;
GRANT SELECT                 ON public.pesquisa_resposta_item TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pesquisa       TO authenticated;
GRANT SELECT                 ON public.pesquisa_pergunta      TO authenticated;
GRANT SELECT                 ON public.pesquisa_opcao         TO authenticated;
GRANT SELECT, INSERT         ON public.pesquisa_dispensa      TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs do usuário
-- ════════════════════════════════════════════════════════════════════════════

-- Pesquisas ativas, no prazo, do segmento do usuário, que ele ainda não
-- respondeu nem dispensou — já com perguntas e opções aninhadas.
CREATE OR REPLACE FUNCTION public.buscar_pesquisas_pendentes()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH pendentes AS (
    SELECT s.*
    FROM public.pesquisa s
    WHERE s.ativa = true
      AND (s.encerra_em IS NULL OR s.encerra_em > now())
      AND public.nivel_no_segmento((SELECT public.nivel_acesso()), s.segmento)
      AND EXISTS (SELECT 1 FROM public.pesquisa_pergunta q WHERE q.pesquisa_id = s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.pesquisa_resposta r
        WHERE r.pesquisa_id = s.id AND r.user_id = (SELECT auth.uid())
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.pesquisa_dispensa d
        WHERE d.pesquisa_id = s.id AND d.user_id = (SELECT auth.uid())
      )
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'titulo', p.titulo,
      'descricao', p.descricao,
      'perguntas', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'tipo', q.tipo,
            'enunciado', q.enunciado,
            'ajuda', q.ajuda,
            'obrigatoria', q.obrigatoria,
            'escala_min', q.escala_min,
            'escala_max', q.escala_max,
            'escala_min_label', q.escala_min_label,
            'escala_max_label', q.escala_max_label,
            'opcoes', (
              SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) ORDER BY o.ordem), '[]'::jsonb)
              FROM public.pesquisa_opcao o WHERE o.pergunta_id = q.id
            )
          ) ORDER BY q.ordem
        ), '[]'::jsonb)
        FROM public.pesquisa_pergunta q WHERE q.pesquisa_id = p.id
      )
    ) ORDER BY p.criado_em
  ), '[]'::jsonb)
  FROM pendentes p;
$$;

REVOKE ALL ON FUNCTION public.buscar_pesquisas_pendentes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buscar_pesquisas_pendentes() TO authenticated;

-- Grava a resposta do usuário atual. p_itens:
--   [{ "pergunta_id": uuid, "texto": text?, "numero": int?, "opcao_ids": [uuid] }]
-- Itens vazios são descartados (pergunta pulada). Perguntas obrigatórias sem
-- conteúdo abortam a transação inteira.
CREATE OR REPLACE FUNCTION public.responder_pesquisa(p_pesquisa_id UUID, p_itens JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user       UUID := auth.uid();
  v_resposta_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0020';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pesquisa s
    WHERE s.id = p_pesquisa_id
      AND s.ativa = true
      AND (s.encerra_em IS NULL OR s.encerra_em > now())
      AND public.nivel_no_segmento(public.nivel_acesso(v_user), s.segmento)
  ) THEN
    RAISE EXCEPTION 'Pesquisa indisponivel' USING ERRCODE = 'P0021';
  END IF;

  INSERT INTO public.pesquisa_resposta (pesquisa_id, user_id)
  VALUES (p_pesquisa_id, v_user)
  ON CONFLICT (pesquisa_id, user_id) DO NOTHING
  RETURNING id INTO v_resposta_id;

  IF v_resposta_id IS NULL THEN
    RAISE EXCEPTION 'Pesquisa ja respondida' USING ERRCODE = 'P0022';
  END IF;

  INSERT INTO public.pesquisa_resposta_item (resposta_id, pergunta_id, valor_texto, valor_numero, opcao_ids)
  SELECT
    v_resposta_id,
    q.id,
    NULLIF(btrim(COALESCE(it.item->>'texto', '')), ''),
    CASE
      WHEN q.tipo IN ('escala','nps') AND NULLIF(it.item->>'numero', '') IS NOT NULL
        THEN (it.item->>'numero')::INT
    END,
    CASE
      WHEN q.tipo IN ('escolha_unica','multipla_escolha') AND jsonb_typeof(it.item->'opcao_ids') = 'array' THEN (
        SELECT COALESCE(array_agg(o.id ORDER BY o.ordem), '{}'::UUID[])
        FROM jsonb_array_elements_text(it.item->'opcao_ids') AS e(valor)
        JOIN public.pesquisa_opcao o
          ON o.id = e.valor::UUID AND o.pergunta_id = q.id
      )
      ELSE '{}'::UUID[]
    END
  FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) AS it(item)
  JOIN public.pesquisa_pergunta q
    ON q.id = NULLIF(it.item->>'pergunta_id', '')::UUID
   AND q.pesquisa_id = p_pesquisa_id
  ON CONFLICT (resposta_id, pergunta_id) DO NOTHING;

  -- Item sem nenhum conteúdo = pergunta pulada; não vira linha.
  DELETE FROM public.pesquisa_resposta_item i
  WHERE i.resposta_id = v_resposta_id
    AND i.valor_texto IS NULL
    AND i.valor_numero IS NULL
    AND COALESCE(array_length(i.opcao_ids, 1), 0) = 0;

  -- Nota fora da escala: aceitar distorceria a média e, no caso da escala,
  -- ficaria invisível no gráfico (a distribuição só varre escala_min..max),
  -- fazendo as barras não fecharem com o total sem explicação na tela.
  IF EXISTS (
    SELECT 1
    FROM public.pesquisa_resposta_item i
    JOIN public.pesquisa_pergunta q ON q.id = i.pergunta_id
    WHERE i.resposta_id = v_resposta_id
      AND i.valor_numero IS NOT NULL
      AND (
        (q.tipo = 'nps'    AND (i.valor_numero < 0 OR i.valor_numero > 10)) OR
        (q.tipo = 'escala' AND (i.valor_numero < q.escala_min OR i.valor_numero > q.escala_max))
      )
  ) THEN
    RAISE EXCEPTION 'Nota fora da escala da pergunta' USING ERRCODE = 'P0029';
  END IF;

  -- Escolha única aceita no máximo uma alternativa.
  IF EXISTS (
    SELECT 1
    FROM public.pesquisa_resposta_item i
    JOIN public.pesquisa_pergunta q ON q.id = i.pergunta_id
    WHERE i.resposta_id = v_resposta_id
      AND q.tipo = 'escolha_unica'
      AND COALESCE(array_length(i.opcao_ids, 1), 0) > 1
  ) THEN
    RAISE EXCEPTION 'Escolha unica aceita uma alternativa' USING ERRCODE = 'P0023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pesquisa_pergunta q
    WHERE q.pesquisa_id = p_pesquisa_id
      AND q.obrigatoria = true
      AND NOT EXISTS (
        SELECT 1 FROM public.pesquisa_resposta_item i
        WHERE i.resposta_id = v_resposta_id AND i.pergunta_id = q.id
      )
  ) THEN
    RAISE EXCEPTION 'Responda as perguntas obrigatorias' USING ERRCODE = 'P0024';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.responder_pesquisa(UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.responder_pesquisa(UUID, JSONB) TO authenticated;

-- "Agora não": a pesquisa não volta a aparecer para este usuário.
CREATE OR REPLACE FUNCTION public.dispensar_pesquisa(p_pesquisa_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.pesquisa_dispensa (pesquisa_id, user_id)
  VALUES (p_pesquisa_id, (SELECT auth.uid()))
  ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.dispensar_pesquisa(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispensar_pesquisa(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs do admin
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_listar_pesquisas()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'titulo', s.titulo,
        'descricao', s.descricao,
        'segmento', s.segmento,
        'ativa', s.ativa,
        'encerra_em', s.encerra_em,
        'criado_em', s.criado_em,
        'atualizado_em', s.atualizado_em,
        'total_perguntas', (SELECT count(*) FROM public.pesquisa_pergunta q WHERE q.pesquisa_id = s.id),
        'total_respostas', (SELECT count(*) FROM public.pesquisa_resposta r WHERE r.pesquisa_id = s.id),
        'total_dispensas', (SELECT count(*) FROM public.pesquisa_dispensa d WHERE d.pesquisa_id = s.id)
      ) ORDER BY s.criado_em DESC
    ), '[]'::jsonb)
    FROM public.pesquisa s
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_listar_pesquisas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_pesquisas() TO authenticated;

-- Estrutura completa para o editor. `total_respostas` diz se a estrutura está
-- congelada.
CREATE OR REPLACE FUNCTION public.admin_obter_pesquisa(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', s.id,
    'titulo', s.titulo,
    'descricao', s.descricao,
    'segmento', s.segmento,
    'ativa', s.ativa,
    'encerra_em', s.encerra_em,
    'criado_em', s.criado_em,
    'atualizado_em', s.atualizado_em,
    'total_respostas', (SELECT count(*) FROM public.pesquisa_resposta r WHERE r.pesquisa_id = s.id),
    'perguntas', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'tipo', q.tipo,
          'enunciado', q.enunciado,
          'ajuda', q.ajuda,
          'obrigatoria', q.obrigatoria,
          'escala_min', q.escala_min,
          'escala_max', q.escala_max,
          'escala_min_label', q.escala_min_label,
          'escala_max_label', q.escala_max_label,
          'opcoes', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) ORDER BY o.ordem), '[]'::jsonb)
            FROM public.pesquisa_opcao o WHERE o.pergunta_id = q.id
          )
        ) ORDER BY q.ordem
      ), '[]'::jsonb)
      FROM public.pesquisa_pergunta q WHERE q.pesquisa_id = s.id
    )
  )
  INTO v_result
  FROM public.pesquisa s
  WHERE s.id = p_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Pesquisa nao encontrada' USING ERRCODE = 'P0025';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_obter_pesquisa(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_obter_pesquisa(UUID) TO authenticated;

-- Salva pesquisa + estrutura em uma transação.
--   p_payload = { id?, titulo, descricao?, segmento, ativa, encerra_em?,
--                 perguntas?: [{ id?, tipo, enunciado, ajuda?, obrigatoria,
--                                escala_min, escala_max, escala_min_label?,
--                                escala_max_label?, opcoes?: [{ id?, label }] }] }
-- A chave `perguntas` é opcional: omiti-la salva só o cabeçalho. Se a pesquisa
-- já tem respostas, mandar `perguntas` é erro — a estrutura está congelada.
CREATE OR REPLACE FUNCTION public.admin_salvar_pesquisa(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id          UUID;
  v_perguntas   JSONB;
  v_q           RECORD;
  v_o           RECORD;
  v_qid         UUID;
  v_oid         UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_id := NULLIF(p_payload->>'id', '')::UUID;

  IF v_id IS NULL THEN
    INSERT INTO public.pesquisa (titulo, descricao, segmento, ativa, encerra_em)
    VALUES (
      btrim(p_payload->>'titulo'),
      NULLIF(btrim(COALESCE(p_payload->>'descricao', '')), ''),
      COALESCE(NULLIF(p_payload->>'segmento', ''), 'todos'),
      COALESCE((p_payload->>'ativa')::BOOLEAN, false),
      NULLIF(p_payload->>'encerra_em', '')::TIMESTAMPTZ
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.pesquisa SET
      titulo        = btrim(p_payload->>'titulo'),
      descricao     = NULLIF(btrim(COALESCE(p_payload->>'descricao', '')), ''),
      segmento      = COALESCE(NULLIF(p_payload->>'segmento', ''), 'todos'),
      ativa         = COALESCE((p_payload->>'ativa')::BOOLEAN, false),
      encerra_em    = NULLIF(p_payload->>'encerra_em', '')::TIMESTAMPTZ,
      atualizado_em = now()
    WHERE id = v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pesquisa nao encontrada' USING ERRCODE = 'P0025';
    END IF;
  END IF;

  IF NOT (p_payload ? 'perguntas') THEN
    RETURN v_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pesquisa_resposta r WHERE r.pesquisa_id = v_id) THEN
    RAISE EXCEPTION 'pesquisa_travada: ja existem respostas, duplique a pesquisa para mudar as perguntas'
      USING ERRCODE = 'P0026';
  END IF;

  v_perguntas := COALESCE(p_payload->'perguntas', '[]'::jsonb);

  DELETE FROM public.pesquisa_pergunta q
  WHERE q.pesquisa_id = v_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_perguntas) AS t(item)
      WHERE NULLIF(t.item->>'id', '')::UUID = q.id
    );

  FOR v_q IN
    SELECT item, ord FROM jsonb_array_elements(v_perguntas) WITH ORDINALITY AS t(item, ord)
  LOOP
    IF v_q.item->>'tipo' IN ('escolha_unica','multipla_escolha')
       AND jsonb_array_length(COALESCE(v_q.item->'opcoes', '[]'::jsonb)) < 2 THEN
      RAISE EXCEPTION 'Pergunta de escolha precisa de ao menos 2 alternativas' USING ERRCODE = 'P0027';
    END IF;

    v_qid := NULLIF(v_q.item->>'id', '')::UUID;

    IF v_qid IS NULL THEN
      INSERT INTO public.pesquisa_pergunta (
        pesquisa_id, ordem, tipo, enunciado, ajuda, obrigatoria,
        escala_min, escala_max, escala_min_label, escala_max_label
      ) VALUES (
        v_id,
        v_q.ord::INT,
        v_q.item->>'tipo',
        btrim(v_q.item->>'enunciado'),
        NULLIF(btrim(COALESCE(v_q.item->>'ajuda', '')), ''),
        COALESCE((v_q.item->>'obrigatoria')::BOOLEAN, false),
        COALESCE((v_q.item->>'escala_min')::INT, 1),
        COALESCE((v_q.item->>'escala_max')::INT, 5),
        NULLIF(btrim(COALESCE(v_q.item->>'escala_min_label', '')), ''),
        NULLIF(btrim(COALESCE(v_q.item->>'escala_max_label', '')), '')
      )
      RETURNING id INTO v_qid;
    ELSE
      UPDATE public.pesquisa_pergunta SET
        ordem            = v_q.ord::INT,
        tipo             = v_q.item->>'tipo',
        enunciado        = btrim(v_q.item->>'enunciado'),
        ajuda            = NULLIF(btrim(COALESCE(v_q.item->>'ajuda', '')), ''),
        obrigatoria      = COALESCE((v_q.item->>'obrigatoria')::BOOLEAN, false),
        escala_min       = COALESCE((v_q.item->>'escala_min')::INT, 1),
        escala_max       = COALESCE((v_q.item->>'escala_max')::INT, 5),
        escala_min_label = NULLIF(btrim(COALESCE(v_q.item->>'escala_min_label', '')), ''),
        escala_max_label = NULLIF(btrim(COALESCE(v_q.item->>'escala_max_label', '')), '')
      WHERE id = v_qid AND pesquisa_id = v_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pergunta nao pertence a esta pesquisa' USING ERRCODE = 'P0028';
      END IF;
    END IF;

    DELETE FROM public.pesquisa_opcao o
    WHERE o.pergunta_id = v_qid
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_q.item->'opcoes', '[]'::jsonb)) AS t(item)
        WHERE NULLIF(t.item->>'id', '')::UUID = o.id
      );

    FOR v_o IN
      SELECT item, ord FROM jsonb_array_elements(COALESCE(v_q.item->'opcoes', '[]'::jsonb)) WITH ORDINALITY AS t(item, ord)
    LOOP
      v_oid := NULLIF(v_o.item->>'id', '')::UUID;

      IF v_oid IS NULL THEN
        INSERT INTO public.pesquisa_opcao (pergunta_id, ordem, label)
        VALUES (v_qid, v_o.ord::INT, btrim(v_o.item->>'label'));
      ELSE
        UPDATE public.pesquisa_opcao
           SET ordem = v_o.ord::INT, label = btrim(v_o.item->>'label')
         WHERE id = v_oid AND pergunta_id = v_qid;

        -- Sem a guarda, editar em duas abas perderia a alternativa em silêncio:
        -- a aba que apagou vence e a que renomeou ainda ouve "Pesquisa salva".
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Alternativa nao pertence a esta pergunta' USING ERRCODE = 'P0028';
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_salvar_pesquisa(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_pesquisa(JSONB) TO authenticated;

-- Cópia em rascunho (sem respostas): caminho oficial para "editar" uma
-- pesquisa que já rodou.
CREATE OR REPLACE FUNCTION public.admin_duplicar_pesquisa(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_novo UUID;
  v_q    RECORD;
  v_qid  UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- `encerra_em` NÃO é copiado de propósito: duplicar é o caminho para mexer
  -- numa pesquisa que já rodou, e essa costuma ter a data no passado — a cópia
  -- nasceria expirada, publicada e invisível para todo mundo.
  INSERT INTO public.pesquisa (titulo, descricao, segmento, ativa, encerra_em)
  SELECT left(s.titulo, 180) || ' (cópia)', s.descricao, s.segmento, false, NULL
  FROM public.pesquisa s WHERE s.id = p_id
  RETURNING id INTO v_novo;

  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Pesquisa nao encontrada' USING ERRCODE = 'P0025';
  END IF;

  FOR v_q IN SELECT * FROM public.pesquisa_pergunta WHERE pesquisa_id = p_id ORDER BY ordem LOOP
    INSERT INTO public.pesquisa_pergunta (
      pesquisa_id, ordem, tipo, enunciado, ajuda, obrigatoria,
      escala_min, escala_max, escala_min_label, escala_max_label
    ) VALUES (
      v_novo, v_q.ordem, v_q.tipo, v_q.enunciado, v_q.ajuda, v_q.obrigatoria,
      v_q.escala_min, v_q.escala_max, v_q.escala_min_label, v_q.escala_max_label
    )
    RETURNING id INTO v_qid;

    INSERT INTO public.pesquisa_opcao (pergunta_id, ordem, label)
    SELECT v_qid, o.ordem, o.label FROM public.pesquisa_opcao o WHERE o.pergunta_id = v_q.id ORDER BY o.ordem;
  END LOOP;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_duplicar_pesquisa(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_duplicar_pesquisa(UUID) TO authenticated;

-- Agregado dos resultados: contagem por alternativa, média e distribuição das
-- escalas, NPS calculado e a lista das respostas de texto.
CREATE OR REPLACE FUNCTION public.admin_resultados_pesquisa(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', s.id,
    'titulo', s.titulo,
    'descricao', s.descricao,
    'segmento', s.segmento,
    'ativa', s.ativa,
    'encerra_em', s.encerra_em,
    'criado_em', s.criado_em,
    'total_respostas', (SELECT count(*) FROM public.pesquisa_resposta r WHERE r.pesquisa_id = s.id),
    'total_dispensas', (SELECT count(*) FROM public.pesquisa_dispensa d WHERE d.pesquisa_id = s.id),
    'perguntas', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'tipo', q.tipo,
          'enunciado', q.enunciado,
          'obrigatoria', q.obrigatoria,
          'escala_min', q.escala_min,
          'escala_max', q.escala_max,
          'escala_min_label', q.escala_min_label,
          'escala_max_label', q.escala_max_label,
          'total_respondido', (
            SELECT count(*) FROM public.pesquisa_resposta_item i WHERE i.pergunta_id = q.id
          ),
          'opcoes', (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'label', o.label,
                'total', (
                  SELECT count(*) FROM public.pesquisa_resposta_item i
                  WHERE i.pergunta_id = q.id AND o.id = ANY (i.opcao_ids)
                )
              ) ORDER BY o.ordem
            ), '[]'::jsonb)
            FROM public.pesquisa_opcao o WHERE o.pergunta_id = q.id
          ),
          'media', (
            SELECT round(avg(i.valor_numero)::numeric, 2)
            FROM public.pesquisa_resposta_item i
            WHERE i.pergunta_id = q.id AND i.valor_numero IS NOT NULL
          ),
          'distribuicao', (
            SELECT COALESCE(jsonb_agg(d ORDER BY (d->>'valor')::INT), '[]'::jsonb)
            FROM (
              SELECT jsonb_build_object('valor', v.valor, 'total', (
                SELECT count(*) FROM public.pesquisa_resposta_item i
                WHERE i.pergunta_id = q.id AND i.valor_numero = v.valor
              )) AS d
              FROM generate_series(
                CASE WHEN q.tipo = 'nps' THEN 0 ELSE q.escala_min END,
                CASE WHEN q.tipo = 'nps' THEN 10 ELSE q.escala_max END
              ) AS v(valor)
              WHERE q.tipo IN ('escala','nps')
            ) t
          ),
          'nps', CASE WHEN q.tipo = 'nps' THEN (
            SELECT CASE WHEN count(*) = 0 THEN NULL ELSE round(
              (count(*) FILTER (WHERE i.valor_numero >= 9) - count(*) FILTER (WHERE i.valor_numero <= 6))::numeric
              * 100 / count(*), 1
            ) END
            FROM public.pesquisa_resposta_item i
            WHERE i.pergunta_id = q.id AND i.valor_numero IS NOT NULL
          ) END,
          -- Total real, para a tela não prometer mais do que `textos` entrega.
          'textos_total', CASE WHEN q.tipo IN ('texto_curto','texto_longo') THEN (
            SELECT count(*) FROM public.pesquisa_resposta_item i
            WHERE i.pergunta_id = q.id AND i.valor_texto IS NOT NULL
          ) END,
          'textos', CASE WHEN q.tipo IN ('texto_curto','texto_longo') THEN (
            SELECT COALESCE(jsonb_agg(t.linha ORDER BY t.criado_em DESC), '[]'::jsonb)
            FROM (
              SELECT jsonb_build_object(
                       'texto', i.valor_texto,
                       'criado_em', r.criado_em,
                       'usuario', COALESCE(NULLIF(btrim(pr.nome_completo), ''), pr.email, '—')
                     ) AS linha,
                     r.criado_em
              FROM public.pesquisa_resposta_item i
              JOIN public.pesquisa_resposta r ON r.id = i.resposta_id
              LEFT JOIN public.profiles pr ON pr.id = r.user_id
              WHERE i.pergunta_id = q.id AND i.valor_texto IS NOT NULL
              ORDER BY r.criado_em DESC
              LIMIT 300
            ) t
          ) END
        ) ORDER BY q.ordem
      ), '[]'::jsonb)
      FROM public.pesquisa_pergunta q WHERE q.pesquisa_id = s.id
    )
  )
  INTO v_result
  FROM public.pesquisa s
  WHERE s.id = p_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Pesquisa nao encontrada' USING ERRCODE = 'P0025';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resultados_pesquisa(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_resultados_pesquisa(UUID) TO authenticated;

COMMENT ON TABLE public.pesquisa IS
  'Pesquisas in-app exibidas como modal na entrada do dashboard. Responder nunca é obrigatório.';
COMMENT ON FUNCTION public.admin_salvar_pesquisa(JSONB) IS
  'Salva cabeçalho + estrutura. Estrutura congela na primeira resposta (erro P0026); use admin_duplicar_pesquisa.';
