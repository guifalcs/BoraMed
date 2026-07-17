-- ============================================================================
-- Plano Essencial: flashcards e materiais de estudo passam a exigir tier
-- 'avancado' (antes bastava qualquer assinatura ativa via tem_assinatura_ativa).
--
-- Bases usadas (versão vigente antes desta migration):
--   - flashcard_decks_select / flashcard_cards_select:
--     20260712211516_flashcards_fixes_revisao.sql
--   - flashcard_imagens_insert (storage): 20260712211353_flashcards.sql
--     (nunca redefinida depois)
--   - material_categoria_select / material_topico_select / material_arquivo_select
--     / materiais_storage_select: 20260627120000_materiais_estudo.sql
--     (nunca redefinidas depois)
--   - flashcards_criar_deck / flashcards_atualizar_deck:
--     20260713120000_flashcards_lado_texto_ou_imagem.sql
--   - flashcards_toggle_like: 20260712211516_flashcards_fixes_revisao.sql
--
-- NÃO altera: policies de escrita de admin, RPC flashcards_excluir_deck
-- (não checa assinatura), flashcards_admin_salvar_deck_oficial (admin-only,
-- sem checagem de assinatura) e nada em questao/alternativa.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1) flashcard_decks / flashcard_cards — SELECT exige tier avançado
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS flashcard_decks_select ON public.flashcard_decks;
CREATE POLICY flashcard_decks_select
  ON public.flashcard_decks
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
    OR (publico AND (SELECT public.tem_acesso_avancado()))
  );

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
          OR (d.publico AND (SELECT public.tem_acesso_avancado()))
        )
    )
  );

-- ------------------------------------------------------------------
-- 2) Storage flashcard-imagens: upload próprio exige tier avançado
-- ------------------------------------------------------------------
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
            AND (SELECT public.tem_acesso_avancado())
          )
          OR (SELECT public.is_admin())
        )
      )
    )
  );

-- ------------------------------------------------------------------
-- 3) Materiais de estudo — SELECT exige tier avançado
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS material_categoria_select ON public.material_categoria;
CREATE POLICY material_categoria_select
  ON public.material_categoria
  FOR SELECT
  TO authenticated
  USING (
    (ativo AND (SELECT public.tem_acesso_avancado()))
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS material_topico_select ON public.material_topico;
CREATE POLICY material_topico_select
  ON public.material_topico
  FOR SELECT
  TO authenticated
  USING (
    (ativo AND (SELECT public.tem_acesso_avancado()))
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS material_arquivo_select ON public.material_arquivo;
CREATE POLICY material_arquivo_select
  ON public.material_arquivo
  FOR SELECT
  TO authenticated
  USING (
    (ativo AND (SELECT public.tem_acesso_avancado()))
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS materiais_storage_select ON storage.objects;
CREATE POLICY materiais_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'materiais'
    AND (
      (SELECT public.tem_acesso_avancado())
      OR (SELECT public.is_admin())
    )
  );

-- ------------------------------------------------------------------
-- 4) RPCs de escrita de flashcards — troca do gate de assinatura
-- ------------------------------------------------------------------

-- 4.1 flashcards_criar_deck (base: 20260713120000)
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
  IF NOT public.tem_acesso_avancado(v_user_id) THEN
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

REVOKE EXECUTE ON FUNCTION public.flashcards_criar_deck(text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_criar_deck(text, text, boolean, jsonb) TO authenticated;

-- 4.2 flashcards_atualizar_deck (base: 20260713120000)
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
    IF NOT public.tem_acesso_avancado(v_user_id) THEN
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

REVOKE EXECUTE ON FUNCTION public.flashcards_atualizar_deck(uuid, text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flashcards_atualizar_deck(uuid, text, text, boolean, jsonb) TO authenticated;

-- 4.3 flashcards_toggle_like (base: 20260712211516)
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
  IF public.is_banned(v_user_id) THEN
    RAISE EXCEPTION 'Usuario banido' USING ERRCODE = 'P0009';
  END IF;
  IF NOT public.tem_acesso_avancado(v_user_id) AND NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Assinatura ativa necessaria' USING ERRCODE = 'P0011';
  END IF;

  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = p_deck_id;
  IF NOT FOUND OR NOT v_deck.publico OR v_deck.oficial THEN
    RAISE EXCEPTION 'Deck nao disponivel para curtidas' USING ERRCODE = 'P0007';
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

-- 4.4 flashcards_feed (base: 20260712211353, exige assinatura para navegar o feed)
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
  IF NOT public.tem_acesso_avancado(v_user_id) THEN
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
