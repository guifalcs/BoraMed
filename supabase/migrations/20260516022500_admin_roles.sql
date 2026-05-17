
-- ============================================================
-- Coluna papel em profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'aluno'
  CHECK (papel IN ('aluno', 'admin'));

-- ============================================================
-- Função SECURITY DEFINER: verifica se uid é admin
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
    WHERE id = uid AND papel = 'admin'
  );
$$;

-- ============================================================
-- Trigger: impede que usuário não-admin altere o próprio papel
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
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'permission_denied: apenas administradores podem alterar o papel do usuário';
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
-- RLS: admins veem todos os profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================
-- RLS conteúdo: admins têm acesso total
-- ============================================================
DROP POLICY IF EXISTS "questao_admin_all" ON public.questao;
CREATE POLICY "questao_admin_all"
  ON public.questao FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "alternativa_admin_all" ON public.alternativa;
CREATE POLICY "alternativa_admin_all"
  ON public.alternativa FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "prova_admin_all" ON public.prova;
CREATE POLICY "prova_admin_all"
  ON public.prova FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "tema_admin_all" ON public.tema;
CREATE POLICY "tema_admin_all"
  ON public.tema FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "faculdade_admin_all" ON public.faculdade;
CREATE POLICY "faculdade_admin_all"
  ON public.faculdade FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "questao_tema_admin_all" ON public.questao_tema;
CREATE POLICY "questao_tema_admin_all"
  ON public.questao_tema FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "tentativa_select_admin" ON public.tentativa;
CREATE POLICY "tentativa_select_admin"
  ON public.tentativa FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================
-- RPC de métricas para o dashboard admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT jsonb_build_object(
    'total_usuarios',    (SELECT COUNT(*) FROM public.profiles),
    'usuarios_hoje',     (SELECT COUNT(*) FROM public.profiles WHERE criado_em::date = CURRENT_DATE),
    'total_questoes',    (SELECT COUNT(*) FROM public.questao),
    'questoes_ativas',   (SELECT COUNT(*) FROM public.questao WHERE status = 'ativa'),
    'questoes_rascunho', (SELECT COUNT(*) FROM public.questao WHERE status = 'rascunho'),
    'total_provas',      (SELECT COUNT(*) FROM public.prova),
    'total_tentativas',  (SELECT COUNT(*) FROM public.tentativa),
    'tentativas_hoje',   (SELECT COUNT(*) FROM public.tentativa WHERE criado_em::date = CURRENT_DATE),
    'total_temas',       (SELECT COUNT(*) FROM public.tema)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_stats() TO authenticated;

-- ============================================================
-- Seed: promover Guilherme a admin
-- ============================================================
UPDATE public.profiles
  SET papel = 'admin'
  WHERE email = 'guifalcao2017@gmail.com';
;
