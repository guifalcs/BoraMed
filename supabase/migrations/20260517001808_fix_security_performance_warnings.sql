
-- ============================================================
-- 1. SEGURANÇA: revogar EXECUTE de anon/authenticated em
--    funções que só admin deve chamar
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.admin_get_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_stats() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.prevent_papel_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_papel_change() FROM authenticated;

-- Garantir que só authenticated possa chamar is_admin (já deve estar assim, mas explícito)
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_stats() TO authenticated;

-- ============================================================
-- 2. PERFORMANCE: corrigir múltiplas políticas permissivas
--    para SELECT na mesma tabela/role.
--    Estratégia: dropar políticas _admin_all (tipo ALL) e
--    recriar apenas como INSERT + UPDATE + DELETE,
--    pois SELECT já é coberto pelas políticas _select_*.
-- ============================================================

-- alternativa
DROP POLICY IF EXISTS alternativa_admin_all ON public.alternativa;
CREATE POLICY alternativa_admin_insert ON public.alternativa
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY alternativa_admin_update ON public.alternativa
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY alternativa_admin_delete ON public.alternativa
  FOR DELETE TO authenticated USING (public.is_admin());

-- disciplina
DROP POLICY IF EXISTS disciplina_admin_all ON public.disciplina;
CREATE POLICY disciplina_admin_insert ON public.disciplina
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY disciplina_admin_update ON public.disciplina
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY disciplina_admin_delete ON public.disciplina
  FOR DELETE TO authenticated USING (public.is_admin());

-- faculdade
DROP POLICY IF EXISTS faculdade_admin_all ON public.faculdade;
CREATE POLICY faculdade_admin_insert ON public.faculdade
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY faculdade_admin_update ON public.faculdade
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY faculdade_admin_delete ON public.faculdade
  FOR DELETE TO authenticated USING (public.is_admin());

-- prova
DROP POLICY IF EXISTS prova_admin_all ON public.prova;
CREATE POLICY prova_admin_insert ON public.prova
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY prova_admin_update ON public.prova
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY prova_admin_delete ON public.prova
  FOR DELETE TO authenticated USING (public.is_admin());

-- questao
DROP POLICY IF EXISTS questao_admin_all ON public.questao;
CREATE POLICY questao_admin_insert ON public.questao
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY questao_admin_update ON public.questao
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY questao_admin_delete ON public.questao
  FOR DELETE TO authenticated USING (public.is_admin());

-- questao_tema
DROP POLICY IF EXISTS questao_tema_admin_all ON public.questao_tema;
CREATE POLICY questao_tema_admin_insert ON public.questao_tema
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY questao_tema_admin_update ON public.questao_tema
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY questao_tema_admin_delete ON public.questao_tema
  FOR DELETE TO authenticated USING (public.is_admin());

-- tema
DROP POLICY IF EXISTS tema_admin_all ON public.tema;
CREATE POLICY tema_admin_insert ON public.tema
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY tema_admin_update ON public.tema
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY tema_admin_delete ON public.tema
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- 3. PERFORMANCE: mesclar políticas SELECT duplicadas em
--    profiles e tentativa
-- ============================================================

-- profiles: mesclar profiles_select_admin + profiles_select_own
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- tentativa: mesclar tentativa_select_admin + tentativa_select_own
DROP POLICY IF EXISTS tentativa_select_admin ON public.tentativa;
DROP POLICY IF EXISTS tentativa_select_own ON public.tentativa;
CREATE POLICY tentativa_select ON public.tentativa
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
;
