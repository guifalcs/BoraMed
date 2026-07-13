-- Flashcards: cada lado do card (frente/verso) passa a aceitar texto OU imagem
-- OU ambos — nunca vazio. Antes o texto era obrigatório nos dois lados (não
-- dava pra ter card só com imagem). O deck continua exigindo ao menos 1 card,
-- e agora cada card só é válido quando os dois lados têm texto ou imagem.
--
-- Mudança puramente de RELAXAMENTO: toda linha existente (texto 1..2000) segue
-- válida — sem backfill, sem risco às linhas atuais.

-- ============================================================
-- 1. CHECK constraints: texto opcional quando há imagem no lado
-- ============================================================
ALTER TABLE public.flashcard_cards
  DROP CONSTRAINT IF EXISTS flashcard_cards_frente_check,
  DROP CONSTRAINT IF EXISTS flashcard_cards_verso_check;

ALTER TABLE public.flashcard_cards
  ADD CONSTRAINT flashcard_cards_frente_check CHECK (
    char_length(btrim(frente)) <= 2000
    AND (char_length(btrim(frente)) >= 1 OR frente_imagem_url IS NOT NULL)
  ),
  ADD CONSTRAINT flashcard_cards_verso_check CHECK (
    char_length(btrim(verso)) <= 2000
    AND (char_length(btrim(verso)) >= 1 OR verso_imagem_url IS NOT NULL)
  );

-- ============================================================
-- 2. flashcards_criar_deck: validação por lado (texto ou imagem)
-- ============================================================
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
  v_is_admin boolean;
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
  v_is_admin := public.is_admin(v_user_id);

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
    IF char_length(btrim(coalesce(v_card->>'frente', ''))) > 2000
       OR char_length(btrim(coalesce(v_card->>'verso', ''))) > 2000 THEN
      RAISE EXCEPTION 'Frente/verso de card invalido' USING ERRCODE = 'P0004';
    END IF;
    IF (btrim(coalesce(v_card->>'frente', '')) = '' AND nullif(v_card->>'frente_imagem_url', '') IS NULL)
       OR (btrim(coalesce(v_card->>'verso', '')) = '' AND nullif(v_card->>'verso_imagem_url', '') IS NULL) THEN
      RAISE EXCEPTION 'Cada lado do card precisa de texto ou imagem' USING ERRCODE = 'P0004';
    END IF;
    IF public.contem_palavra_proibida(v_card->>'frente') OR public.contem_palavra_proibida(v_card->>'verso') THEN
      RAISE EXCEPTION 'Card contem linguagem inapropriada' USING ERRCODE = 'P0010';
    END IF;
    IF NOT public.flashcards_imagem_url_valida(nullif(v_card->>'frente_imagem_url', ''), v_user_id, v_is_admin)
       OR NOT public.flashcards_imagem_url_valida(nullif(v_card->>'verso_imagem_url', ''), v_user_id, v_is_admin) THEN
      RAISE EXCEPTION 'Imagem de card invalida' USING ERRCODE = 'P0014';
    END IF;
  END LOOP;

  INSERT INTO public.flashcard_decks (user_id, oficial, titulo, descricao, publico)
  VALUES (v_user_id, false, v_titulo, v_descricao, coalesce(p_publico, false))
  RETURNING id INTO v_deck_id;

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    INSERT INTO public.flashcard_cards (deck_id, posicao, frente, verso, frente_imagem_url, verso_imagem_url)
    VALUES (
      v_deck_id, v_posicao,
      btrim(coalesce(v_card->>'frente', '')), btrim(coalesce(v_card->>'verso', '')),
      nullif(v_card->>'frente_imagem_url', ''), nullif(v_card->>'verso_imagem_url', '')
    );
    v_posicao := v_posicao + 1;
  END LOOP;

  RETURN v_deck_id;
END;
$$;

-- ============================================================
-- 3. flashcards_atualizar_deck: validação por lado (texto ou imagem)
-- ============================================================
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
  v_is_admin boolean;
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
  v_is_admin := public.is_admin(v_user_id);

  SELECT EXISTS (
    SELECT 1 FROM public.flashcard_decks
    WHERE id = p_deck_id AND user_id = v_user_id
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Deck nao encontrado ou sem permissao' USING ERRCODE = 'P0007';
  END IF;

  IF NOT v_is_owner AND v_is_admin THEN
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
    IF char_length(btrim(coalesce(v_card->>'frente', ''))) > 2000
       OR char_length(btrim(coalesce(v_card->>'verso', ''))) > 2000 THEN
      RAISE EXCEPTION 'Frente/verso de card invalido' USING ERRCODE = 'P0004';
    END IF;
    IF (btrim(coalesce(v_card->>'frente', '')) = '' AND nullif(v_card->>'frente_imagem_url', '') IS NULL)
       OR (btrim(coalesce(v_card->>'verso', '')) = '' AND nullif(v_card->>'verso_imagem_url', '') IS NULL) THEN
      RAISE EXCEPTION 'Cada lado do card precisa de texto ou imagem' USING ERRCODE = 'P0004';
    END IF;
    IF v_is_owner AND (public.contem_palavra_proibida(v_card->>'frente') OR public.contem_palavra_proibida(v_card->>'verso')) THEN
      RAISE EXCEPTION 'Card contem linguagem inapropriada' USING ERRCODE = 'P0010';
    END IF;
    IF NOT public.flashcards_imagem_url_valida(nullif(v_card->>'frente_imagem_url', ''), v_user_id, v_is_admin)
       OR NOT public.flashcards_imagem_url_valida(nullif(v_card->>'verso_imagem_url', ''), v_user_id, v_is_admin) THEN
      RAISE EXCEPTION 'Imagem de card invalida' USING ERRCODE = 'P0014';
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
      btrim(coalesce(v_card->>'frente', '')), btrim(coalesce(v_card->>'verso', '')),
      nullif(v_card->>'frente_imagem_url', ''), nullif(v_card->>'verso_imagem_url', '')
    );
    v_posicao := v_posicao + 1;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. flashcards_admin_salvar_deck_oficial: validação por lado
-- ============================================================
CREATE OR REPLACE FUNCTION public.flashcards_admin_salvar_deck_oficial(
  p_deck_id uuid,
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
  v_deck_id uuid := p_deck_id;
  v_qtd_cards int;
  v_card jsonb;
  v_posicao int := 0;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'permission_denied';
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

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    IF char_length(btrim(coalesce(v_card->>'frente', ''))) > 2000
       OR char_length(btrim(coalesce(v_card->>'verso', ''))) > 2000 THEN
      RAISE EXCEPTION 'Frente/verso de card invalido' USING ERRCODE = 'P0004';
    END IF;
    IF (btrim(coalesce(v_card->>'frente', '')) = '' AND nullif(v_card->>'frente_imagem_url', '') IS NULL)
       OR (btrim(coalesce(v_card->>'verso', '')) = '' AND nullif(v_card->>'verso_imagem_url', '') IS NULL) THEN
      RAISE EXCEPTION 'Cada lado do card precisa de texto ou imagem' USING ERRCODE = 'P0004';
    END IF;
    IF NOT public.flashcards_imagem_url_valida(nullif(v_card->>'frente_imagem_url', ''), v_user_id, true)
       OR NOT public.flashcards_imagem_url_valida(nullif(v_card->>'verso_imagem_url', ''), v_user_id, true) THEN
      RAISE EXCEPTION 'Imagem de card invalida' USING ERRCODE = 'P0014';
    END IF;
  END LOOP;

  IF v_deck_id IS NULL THEN
    INSERT INTO public.flashcard_decks (user_id, oficial, titulo, descricao, publico)
    VALUES (NULL, true, v_titulo, v_descricao, coalesce(p_publico, false))
    RETURNING id INTO v_deck_id;
  ELSE
    UPDATE public.flashcard_decks SET
      titulo = v_titulo,
      descricao = v_descricao,
      publico = coalesce(p_publico, false)
    WHERE id = v_deck_id AND oficial;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Deck nao encontrado ou sem permissao' USING ERRCODE = 'P0007';
    END IF;
    DELETE FROM public.flashcard_cards WHERE deck_id = v_deck_id;
  END IF;

  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
    INSERT INTO public.flashcard_cards (deck_id, posicao, frente, verso, frente_imagem_url, verso_imagem_url)
    VALUES (
      v_deck_id, v_posicao,
      btrim(coalesce(v_card->>'frente', '')), btrim(coalesce(v_card->>'verso', '')),
      nullif(v_card->>'frente_imagem_url', ''), nullif(v_card->>'verso_imagem_url', '')
    );
    v_posicao := v_posicao + 1;
  END LOOP;

  RETURN v_deck_id;
END;
$$;
