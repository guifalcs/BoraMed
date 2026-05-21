-- Impede que o papel da conta principal seja alterado para qualquer coisa
-- que não seja 'admin', independente de quem faz a chamada.
CREATE OR REPLACE FUNCTION public.prevent_owner_demotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Só age quando papel está sendo alterado
  IF NEW.papel = OLD.papel THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = OLD.id;

  IF v_email = 'guifalcao2017@gmail.com' THEN
    RAISE EXCEPTION 'permission_denied: não é possível alterar o papel da conta principal.';
  END IF;

  RETURN NEW;
END;
$$;

-- Revogar acesso direto à função
REVOKE EXECUTE ON FUNCTION public.prevent_owner_demotion() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_prevent_owner_demotion ON public.profiles;
CREATE TRIGGER trg_prevent_owner_demotion
  BEFORE UPDATE OF papel ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_demotion();
