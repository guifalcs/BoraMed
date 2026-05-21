-- ============================================================
-- Super Admin Role
-- Apenas guifalcao2017@gmail.com pode ser super_admin.
-- Irrevogável via RPC/UI. Único no sistema (partial unique index).
-- ============================================================

-- Garante que não existem 2+ usuários com esse email (duplicata impossível)
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM auth.users WHERE email = 'guifalcao2017@gmail.com';
  IF v_count > 1 THEN
    RAISE EXCEPTION 'Integridade violada: % registros com email guifalcao2017@gmail.com em auth.users', v_count;
  END IF;
END;
$$;

-- Expandir CHECK para incluir super_admin
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_papel_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_papel_check
  CHECK (papel IN ('aluno', 'admin', 'super_admin'));

-- Garantia estrutural: apenas 1 super_admin em toda a tabela
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_super_admin
  ON public.profiles ((true))
  WHERE papel = 'super_admin';

-- ============================================================
-- is_super_admin(): verifica papel estritamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND papel = 'super_admin'
  );
$$;

-- ============================================================
-- is_admin(): atualizar para incluir super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND papel IN ('admin', 'super_admin')
  );
$$;

-- ============================================================
-- prevent_papel_change: reforçar imutabilidade do super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_papel_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.papel IS DISTINCT FROM OLD.papel THEN
    -- service_role / migration (sem auth.uid()): permite
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    -- ninguém via auth pode revogar ou promover super_admin
    IF OLD.papel = 'super_admin' THEN
      RAISE EXCEPTION 'permission_denied: o papel super_admin é irrevogável';
    END IF;
    IF NEW.papel = 'super_admin' THEN
      RAISE EXCEPTION 'permission_denied: impossível promover a super_admin';
    END IF;
    -- apenas super_admin pode alterar papéis de outros
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'permission_denied: apenas o super_admin pode alterar papéis';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_papel_change ON public.profiles;
CREATE TRIGGER profiles_prevent_papel_change
  BEFORE UPDATE OF papel ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_papel_change();

-- ============================================================
-- alterar_papel_usuario: restringir a super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.alterar_papel_usuario(
  p_user_id uuid,
  p_papel text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile public.profiles%rowtype;
  v_target_papel text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: apenas o super_admin pode alterar papéis' USING ERRCODE = 'P0001';
  END IF;

  IF p_papel NOT IN ('aluno', 'admin') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_papel USING ERRCODE = 'P0002';
  END IF;

  SELECT papel INTO v_target_papel FROM public.profiles WHERE id = p_user_id;

  IF v_target_papel = 'super_admin' THEN
    RAISE EXCEPTION 'permission_denied: o papel super_admin não pode ser alterado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET papel = p_papel
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_profile;
END;
$function$;

-- Remover o trigger legado que bloqueava mudanças no owner
-- (substituído pelas novas proteções em prevent_papel_change)
DROP TRIGGER IF EXISTS trg_prevent_owner_demotion ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_owner_demotion();

-- ============================================================
-- Promover guifalcao2017@gmail.com a super_admin
-- ============================================================
UPDATE public.profiles
  SET papel = 'super_admin'
  WHERE email = 'guifalcao2017@gmail.com';
