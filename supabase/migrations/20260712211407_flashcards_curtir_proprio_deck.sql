-- Permite curtir o próprio deck: recria flashcards_toggle_like sem o bloqueio
-- de dono (antigo P0013). Mantém as demais regras: deck precisa existir, ser
-- público e não oficial.

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
