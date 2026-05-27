-- Adiciona coluna de último login à tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ;

-- Preenche o valor histórico para quem já está cadastrado
UPDATE public.profiles p
  SET ultimo_login = u.last_sign_in_at
FROM auth.users u
WHERE p.id = u.id
  AND u.last_sign_in_at IS NOT NULL
  AND p.ultimo_login IS NULL;

-- Função trigger: atualiza profiles.ultimo_login sempre que auth.users.last_sign_in_at mudar
CREATE OR REPLACE FUNCTION public.sync_ultimo_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
     AND NEW.last_sign_in_at IS NOT NULL
  THEN
    UPDATE public.profiles
      SET ultimo_login = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger em auth.users (já aplicado no banco remoto, idempotente)
DROP TRIGGER IF EXISTS trg_sync_ultimo_login ON auth.users;
CREATE TRIGGER trg_sync_ultimo_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ultimo_login();
