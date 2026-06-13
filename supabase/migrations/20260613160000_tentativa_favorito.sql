ALTER TABLE public.tentativa
  ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.toggle_favorito_tentativa(
  p_tentativa_id uuid,
  p_favorito boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tentativa
  SET favorito = p_favorito
  WHERE id = p_tentativa_id
    AND user_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tentativa não encontrada ou sem permissão';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_favorito_tentativa(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_favorito_tentativa(uuid, boolean) TO authenticated;
