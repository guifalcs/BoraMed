-- Módulo Flashcards: decks (oficiais e de usuários) + cards + likes + feed comunidade + admin stats.
-- Escrita de usuário só via RPC (security definer); CRUD direto do admin via policy ALL.

-- ============================================================
-- Bucket flashcard-imagens (2 MB, webp/png/jpeg)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flashcard-imagens',
  'flashcard-imagens',
  true,
  2097152,
  ARRAY['image/webp', 'image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- Tabela flashcard_decks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flashcard_decks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  oficial       boolean     NOT NULL DEFAULT false,
  titulo        text        NOT NULL,
  descricao     text,
  publico       boolean     NOT NULL DEFAULT false,
  likes_count   int         NOT NULL DEFAULT 0,
  cards_count   int         NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_decks_oficial_user_check CHECK (oficial = (user_id IS NULL)),
  CONSTRAINT flashcard_decks_titulo_check CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 120),
  CONSTRAINT flashcard_decks_descricao_check CHECK (descricao IS NULL OR char_length(descricao) <= 500)
);

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER flashcard_decks_atualizado_em_trigger
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

CREATE INDEX IF NOT EXISTS flashcard_decks_user_id_idx
  ON public.flashcard_decks (user_id);

CREATE INDEX IF NOT EXISTS flashcard_decks_oficial_idx
  ON public.flashcard_decks (criado_em DESC)
  WHERE oficial;

CREATE INDEX IF NOT EXISTS flashcard_decks_feed_recentes_idx
  ON public.flashcard_decks (criado_em DESC)
  WHERE publico AND NOT oficial;

CREATE INDEX IF NOT EXISTS flashcard_decks_feed_curtidos_idx
  ON public.flashcard_decks (likes_count DESC, criado_em DESC)
  WHERE publico AND NOT oficial;

REVOKE ALL ON TABLE public.flashcard_decks FROM anon;
GRANT SELECT ON TABLE public.flashcard_decks TO authenticated;
GRANT ALL ON TABLE public.flashcard_decks TO service_role;

DROP POLICY IF EXISTS flashcard_decks_select ON public.flashcard_decks;
CREATE POLICY flashcard_decks_select
  ON public.flashcard_decks
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
    OR ((oficial OR publico) AND (SELECT public.tem_assinatura_ativa()))
  );

DROP POLICY IF EXISTS flashcard_decks_admin_write ON public.flashcard_decks;
CREATE POLICY flashcard_decks_admin_write
  ON public.flashcard_decks
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ============================================================
-- Tabela flashcard_cards
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flashcard_cards (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id           uuid        NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  posicao           int         NOT NULL DEFAULT 0,
  frente            text        NOT NULL,
  verso             text        NOT NULL,
  frente_imagem_url text,
  verso_imagem_url  text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_cards_frente_check CHECK (char_length(btrim(frente)) BETWEEN 1 AND 2000),
  CONSTRAINT flashcard_cards_verso_check CHECK (char_length(btrim(verso)) BETWEEN 1 AND 2000)
);

ALTER TABLE public.flashcard_cards ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER flashcard_cards_atualizado_em_trigger
  BEFORE UPDATE ON public.flashcard_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();

CREATE INDEX IF NOT EXISTS flashcard_cards_deck_posicao_idx
  ON public.flashcard_cards (deck_id, posicao);

REVOKE ALL ON TABLE public.flashcard_cards FROM anon;
GRANT SELECT ON TABLE public.flashcard_cards TO authenticated;
GRANT ALL ON TABLE public.flashcard_cards TO service_role;

DROP POLICY IF EXISTS flashcard_cards_select ON public.flashcard_cards;
CREATE POLICY flashcard_cards_select
  ON public.flashcard_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_decks d
      WHERE d.id = flashcard_cards.deck_id
        AND (
          d.user_id = (SELECT auth.uid())
          OR (SELECT public.is_admin())
          OR ((d.oficial OR d.publico) AND (SELECT public.tem_assinatura_ativa()))
        )
    )
  );

DROP POLICY IF EXISTS flashcard_cards_admin_write ON public.flashcard_cards;
CREATE POLICY flashcard_cards_admin_write
  ON public.flashcard_cards
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ============================================================
-- Tabela flashcard_deck_likes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flashcard_deck_likes (
  deck_id   uuid        NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);

ALTER TABLE public.flashcard_deck_likes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS flashcard_deck_likes_user_id_idx
  ON public.flashcard_deck_likes (user_id);

REVOKE ALL ON TABLE public.flashcard_deck_likes FROM anon;
GRANT SELECT ON TABLE public.flashcard_deck_likes TO authenticated;
GRANT ALL ON TABLE public.flashcard_deck_likes TO service_role;

DROP POLICY IF EXISTS flashcard_deck_likes_select ON public.flashcard_deck_likes;
CREATE POLICY flashcard_deck_likes_select
  ON public.flashcard_deck_likes
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.flashcard_decks d
      WHERE d.id = flashcard_deck_likes.deck_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- Triggers de recalcular contadores
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_fn_flashcard_deck_likes_recalcular()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_deck_id uuid;
BEGIN
  v_deck_id := COALESCE(NEW.deck_id, OLD.deck_id);
  UPDATE public.flashcard_decks SET
    likes_count = (SELECT count(*) FROM public.flashcard_deck_likes WHERE deck_id = v_deck_id)
  WHERE id = v_deck_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER flashcard_deck_likes_recalcular_trigger
  AFTER INSERT OR DELETE ON public.flashcard_deck_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_flashcard_deck_likes_recalcular();

CREATE OR REPLACE FUNCTION public.trg_fn_flashcard_cards_recalcular()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_deck_id uuid;
BEGIN
  v_deck_id := COALESCE(NEW.deck_id, OLD.deck_id);
  UPDATE public.flashcard_decks SET
    cards_count = (SELECT count(*) FROM public.flashcard_cards WHERE deck_id = v_deck_id)
  WHERE id = v_deck_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER flashcard_cards_recalcular_trigger
  AFTER INSERT OR DELETE ON public.flashcard_cards
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_flashcard_cards_recalcular();

-- ============================================================
-- Storage policies (bucket flashcard-imagens)
-- Paths: user/{auth.uid()}/{uuid}.webp  |  oficial/{uuid}.webp
-- ============================================================
DROP POLICY IF EXISTS flashcard_imagens_select ON storage.objects;
CREATE POLICY flashcard_imagens_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'flashcard-imagens');

DROP POLICY IF EXISTS flashcard_imagens_insert ON storage.objects;
CREATE POLICY flashcard_imagens_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'flashcard-imagens'
    AND (
      ((storage.foldername(name))[1] = 'oficial' AND (SELECT public.is_admin()))
      OR (
        (storage.foldername(name))[1] = 'user'
        AND (
          (
            (storage.foldername(name))[2] = (SELECT auth.uid())::text
            AND NOT (SELECT public.is_banned())
            AND (SELECT public.tem_assinatura_ativa())
          )
          OR (SELECT public.is_admin())
        )
      )
    )
  );

DROP POLICY IF EXISTS flashcard_imagens_update ON storage.objects;
CREATE POLICY flashcard_imagens_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'flashcard-imagens'
    AND (
      ((storage.foldername(name))[1] = 'oficial' AND (SELECT public.is_admin()))
      OR (
        (storage.foldername(name))[1] = 'user'
        AND (
          ((storage.foldername(name))[2] = (SELECT auth.uid())::text AND NOT (SELECT public.is_banned()))
          OR (SELECT public.is_admin())
        )
      )
    )
  );

DROP POLICY IF EXISTS flashcard_imagens_delete ON storage.objects;
CREATE POLICY flashcard_imagens_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'flashcard-imagens'
    AND (
      ((storage.foldername(name))[1] = 'oficial' AND (SELECT public.is_admin()))
      OR (
        (storage.foldername(name))[1] = 'user'
        AND (
          ((storage.foldername(name))[2] = (SELECT auth.uid())::text AND NOT (SELECT public.is_banned()))
          OR (SELECT public.is_admin())
        )
      )
    )
  );

-- ============================================================
-- RPCs
-- ============================================================

-- 1. flashcards_criar_deck
CREATE OR REPLACE FUNCTION public.flashcards_criar_deck(
  p_titulo text,
  p_descricao text,
  p_publico boolean,
  p_cards jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_deck_id uuid;
  v_total_decks int;
  v_qtd_cards int;
  v_card jsonb;
  v_posicao int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;
  IF public.is_banned(v_user_id) THEN
    RAISE EXCEPTION 'Usuario banido' USING ERRCODE = 'P0009';
  END IF;
  IF NOT public.tem_assinatura_ativa(v_user_id) THEN
    RAISE EXCEPTION 'Assinatura ativa necessaria' USING ERRCODE = 'P0011';
  END IF;

  IF char_length(v_titulo) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Titulo deve ter entre 3 e 120 caracteres' USING ERRCODE = 'P0005';
  END IF;
  IF v_descricao IS NOT NULL AND char_length(v_descricao) > 500 THEN
    RAISE EXCEPTION 'Descricao muito longa' USING ERRCODE = 'P0005';
  END IF;

  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'Lista de cards invalida' USING ERRCODE = 'P0004';
  END IF;
  v_qtd_cards := jsonb_array_length(p_cards);
  IF v_qtd_cards < 1 OR v_qtd_cards > 200 THEN
    RAISE EXCEPTION 'Deck deve ter entre 1 e 200 cards' USING ERRCODE = 'P0006';
  END IF;

  SELECT count(*) INTO v_total_decks FROM public.flashcard_decks WHERE user_id = v_user_id;
  IF v_total_decks >= 50 THEN
    RAISE EXCEPTION 'Limite de 50 decks por usuario atingido' USING ERRCODE = 'P0012';
  END IF;

  IF public.contem_palavra_proibida(v_titulo) THEN
    RAISE EXCEPTION 'Titulo contem linguagem inapropriada' USING ERRCODE = 'P0010';
  END IF;
  IF v_descricao IS NOT NULL AND public.contem_palavra_proibida(v_descricao) THEN
    RAISE EXCEPTION 'Descricao contem linguagem inapropriada' USING ERRCODE = 'P0010';
  END IF;

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    IF char_length(btrim(coalesce(v_card->>'frente', ''))) NOT BETWEEN 1 AND 2000
       OR char_length(btrim(coalesce(v_card->>'verso', ''))) NOT BETWEEN 1 AND 2000 THEN
      RAISE EXCEPTION 'Frente/verso de card invalido' USING ERRCODE = 'P0004';
    END IF;
    IF public.contem_palavra_proibida(v_card->>'frente') OR public.contem_palavra_proibida(v_card->>'verso') THEN
      RAISE EXCEPTION 'Card contem linguagem inapropriada' USING ERRCODE = 'P0010';
    END IF;
  END LOOP;

  INSERT INTO public.flashcard_decks (user_id, oficial, titulo, descricao, publico)
  VALUES (v_user_id, false, v_titulo, v_descricao, coalesce(p_publico, false))
  RETURNING id INTO v_deck_id;

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    INSERT INTO public.flashcard_cards (deck_id, posicao, frente, verso, frente_imagem_url, verso_imagem_url)
    VALUES (
      v_deck_id, v_posicao,
      btrim(v_card->>'frente'), btrim(v_card->>'verso'),
      nullif(v_card->>'frente_imagem_url', ''), nullif(v_card->>'verso_imagem_url', '')
    );
    v_posicao := v_posicao + 1;
  END LOOP;

  RETURN v_deck_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flashcards_criar_deck(text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_criar_deck(text, text, boolean, jsonb) TO authenticated;

-- 2. flashcards_atualizar_deck
CREATE OR REPLACE FUNCTION public.flashcards_atualizar_deck(
  p_deck_id uuid,
  p_titulo text,
  p_descricao text,
  p_publico boolean,
  p_cards jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_qtd_cards int;
  v_card jsonb;
  v_posicao int := 0;
  v_is_owner boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashcard_decks
    WHERE id = p_deck_id AND user_id = v_user_id
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Deck nao encontrado ou sem permissao' USING ERRCODE = 'P0007';
  END IF;

  IF NOT v_is_owner AND public.is_admin(v_user_id) THEN
    -- admin editando deck oficial: sem filtro de palavras, sem exigencia de assinatura
    NULL;
  ELSE
    IF public.is_banned(v_user_id) THEN
      RAISE EXCEPTION 'Usuario banido' USING ERRCODE = 'P0009';
    END IF;
    IF NOT public.tem_assinatura_ativa(v_user_id) THEN
      RAISE EXCEPTION 'Assinatura ativa necessaria' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  IF char_length(v_titulo) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Titulo deve ter entre 3 e 120 caracteres' USING ERRCODE = 'P0005';
  END IF;
  IF v_descricao IS NOT NULL AND char_length(v_descricao) > 500 THEN
    RAISE EXCEPTION 'Descricao muito longa' USING ERRCODE = 'P0005';
  END IF;

  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'Lista de cards invalida' USING ERRCODE = 'P0004';
  END IF;
  v_qtd_cards := jsonb_array_length(p_cards);
  IF v_qtd_cards < 1 OR v_qtd_cards > 200 THEN
    RAISE EXCEPTION 'Deck deve ter entre 1 e 200 cards' USING ERRCODE = 'P0006';
  END IF;

  IF v_is_owner THEN
    IF public.contem_palavra_proibida(v_titulo) THEN
      RAISE EXCEPTION 'Titulo contem linguagem inapropriada' USING ERRCODE = 'P0010';
    END IF;
    IF v_descricao IS NOT NULL AND public.contem_palavra_proibida(v_descricao) THEN
      RAISE EXCEPTION 'Descricao contem linguagem inapropriada' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    IF char_length(btrim(coalesce(v_card->>'frente', ''))) NOT BETWEEN 1 AND 2000
       OR char_length(btrim(coalesce(v_card->>'verso', ''))) NOT BETWEEN 1 AND 2000 THEN
      RAISE EXCEPTION 'Frente/verso de card invalido' USING ERRCODE = 'P0004';
    END IF;
    IF v_is_owner AND (public.contem_palavra_proibida(v_card->>'frente') OR public.contem_palavra_proibida(v_card->>'verso')) THEN
      RAISE EXCEPTION 'Card contem linguagem inapropriada' USING ERRCODE = 'P0010';
    END IF;
  END LOOP;

  UPDATE public.flashcard_decks SET
    titulo = v_titulo,
    descricao = v_descricao,
    publico = coalesce(p_publico, false)
  WHERE id = p_deck_id;

  DELETE FROM public.flashcard_cards WHERE deck_id = p_deck_id;

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    INSERT INTO public.flashcard_cards (deck_id, posicao, frente, verso, frente_imagem_url, verso_imagem_url)
    VALUES (
      p_deck_id, v_posicao,
      btrim(v_card->>'frente'), btrim(v_card->>'verso'),
      nullif(v_card->>'frente_imagem_url', ''), nullif(v_card->>'verso_imagem_url', '')
    );
    v_posicao := v_posicao + 1;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flashcards_atualizar_deck(uuid, text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_atualizar_deck(uuid, text, text, boolean, jsonb) TO authenticated;

-- 3. flashcards_excluir_deck
CREATE OR REPLACE FUNCTION public.flashcards_excluir_deck(p_deck_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.flashcard_decks
  WHERE id = p_deck_id
    AND (user_id = v_user_id OR public.is_admin(v_user_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deck nao encontrado ou sem permissao' USING ERRCODE = 'P0007';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flashcards_excluir_deck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_excluir_deck(uuid) TO authenticated;

-- 4. flashcards_toggle_like
CREATE OR REPLACE FUNCTION public.flashcards_toggle_like(p_deck_id uuid)
RETURNS TABLE (curtido boolean, likes_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deck public.flashcard_decks;
  v_ja_curtiu boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = p_deck_id;
  IF NOT FOUND OR NOT v_deck.publico OR v_deck.oficial THEN
    RAISE EXCEPTION 'Deck nao disponivel para curtidas' USING ERRCODE = 'P0007';
  END IF;
  IF v_deck.user_id = v_user_id THEN
    RAISE EXCEPTION 'Nao e possivel curtir o proprio deck' USING ERRCODE = 'P0013';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flashcard_deck_likes
    WHERE deck_id = p_deck_id AND user_id = v_user_id
  ) INTO v_ja_curtiu;

  IF v_ja_curtiu THEN
    DELETE FROM public.flashcard_deck_likes WHERE deck_id = p_deck_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.flashcard_deck_likes (deck_id, user_id) VALUES (p_deck_id, v_user_id);
  END IF;

  RETURN QUERY
    SELECT NOT v_ja_curtiu, d.likes_count
    FROM public.flashcard_decks d
    WHERE d.id = p_deck_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flashcards_toggle_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_toggle_like(uuid) TO authenticated;

-- 5. flashcards_feed
CREATE OR REPLACE FUNCTION public.flashcards_feed(
  p_ordenacao text DEFAULT 'recentes',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.tem_assinatura_ativa(v_user_id) THEN
    RAISE EXCEPTION 'Assinatura ativa necessaria' USING ERRCODE = 'P0011';
  END IF;
  IF p_ordenacao NOT IN ('recentes', 'curtidos') THEN
    RAISE EXCEPTION 'Ordenacao invalida' USING ERRCODE = 'P0008';
  END IF;

  WITH pagina AS (
    SELECT
      d.id,
      d.titulo,
      d.descricao,
      d.likes_count,
      d.cards_count,
      d.criado_em,
      d.user_id AS autor_id,
      coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno') AS autor_nome,
      EXISTS (
        SELECT 1 FROM public.flashcard_deck_likes l
        WHERE l.deck_id = d.id AND l.user_id = v_user_id
      ) AS curtido_por_mim
    FROM public.flashcard_decks d
    LEFT JOIN public.profiles p ON p.id = d.user_id
    WHERE d.publico AND NOT d.oficial
      AND d.user_id IS NOT NULL
      AND NOT public.is_banned(d.user_id)
    ORDER BY
      CASE WHEN p_ordenacao = 'curtidos' THEN d.likes_count END DESC,
      d.criado_em DESC
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', pagina.id,
    'titulo', pagina.titulo,
    'descricao', pagina.descricao,
    'likes_count', pagina.likes_count,
    'cards_count', pagina.cards_count,
    'criado_em', pagina.criado_em,
    'autor_id', pagina.autor_id,
    'autor_nome', pagina.autor_nome,
    'curtido_por_mim', pagina.curtido_por_mim
  ) ORDER BY
    CASE WHEN p_ordenacao = 'curtidos' THEN pagina.likes_count END DESC,
    pagina.criado_em DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM pagina;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flashcards_feed(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_feed(text, int, int) TO authenticated;

-- 6. flashcards_listar_likes_deck
CREATE OR REPLACE FUNCTION public.flashcards_listar_likes_deck(
  p_deck_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.flashcard_decks
    WHERE id = p_deck_id AND (user_id = v_user_id OR public.is_admin(v_user_id))
  ) THEN
    RAISE EXCEPTION 'Deck nao encontrado ou sem permissao' USING ERRCODE = 'P0007';
  END IF;

  WITH pagina AS (
    SELECT
      l.user_id,
      coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno') AS nome,
      p.avatar_url,
      l.criado_em
    FROM public.flashcard_deck_likes l
    LEFT JOIN public.profiles p ON p.id = l.user_id
    WHERE l.deck_id = p_deck_id
    ORDER BY l.criado_em DESC
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', pagina.user_id,
    'nome', pagina.nome,
    'avatar_url', pagina.avatar_url,
    'criado_em', pagina.criado_em
  ) ORDER BY pagina.criado_em DESC), '[]'::jsonb)
  INTO v_result
  FROM pagina;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flashcards_listar_likes_deck(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_listar_likes_deck(uuid, int, int) TO authenticated;

-- 7. admin_get_flashcards_stats
CREATE OR REPLACE FUNCTION public.admin_get_flashcards_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT jsonb_build_object(
    'total_decks_oficiais', (SELECT count(*) FROM public.flashcard_decks WHERE oficial),
    'total_decks_usuarios', (SELECT count(*) FROM public.flashcard_decks WHERE NOT oficial),
    'total_decks_publicos', (SELECT count(*) FROM public.flashcard_decks WHERE publico AND NOT oficial),
    'total_cards', (SELECT count(*) FROM public.flashcard_cards),
    'total_likes', (SELECT count(*) FROM public.flashcard_deck_likes),
    'total_criadores', (SELECT count(DISTINCT user_id) FROM public.flashcard_decks WHERE user_id IS NOT NULL),
    'serie_decks_por_dia', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', total) ORDER BY dia), '[]'::jsonb)
      FROM (
        SELECT criado_em::date AS dia, count(*) AS total
        FROM public.flashcard_decks
        WHERE criado_em >= (CURRENT_DATE - INTERVAL '30 days')
        GROUP BY criado_em::date
      ) s
    ),
    'top_publicos_por_likes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'titulo', titulo, 'likes_count', likes_count, 'cards_count', cards_count
      ) ORDER BY likes_count DESC), '[]'::jsonb)
      FROM (
        SELECT id, titulo, likes_count, cards_count
        FROM public.flashcard_decks
        WHERE publico AND NOT oficial
        ORDER BY likes_count DESC
        LIMIT 5
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_flashcards_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_flashcards_stats() TO authenticated;
