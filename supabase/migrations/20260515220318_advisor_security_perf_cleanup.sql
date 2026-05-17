
-- Resolve Supabase advisor warnings (security + performance)

-- ============================================================
-- 1. SECURITY: Revoke EXECUTE on internal/trigger functions
-- ============================================================

-- atualizar_user_gamificacao_stats() — trigger function
REVOKE EXECUTE ON FUNCTION public.atualizar_user_gamificacao_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_user_gamificacao_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_user_gamificacao_stats() FROM PUBLIC;

-- sync_profile_competir_publico() — trigger function
REVOKE EXECUTE ON FUNCTION public.sync_profile_competir_publico() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_competir_publico() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_competir_publico() FROM PUBLIC;

-- verificar_conquistas_usuario(uuid) — internal helper
REVOKE EXECUTE ON FUNCTION public.verificar_conquistas_usuario(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verificar_conquistas_usuario(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verificar_conquistas_usuario(uuid) FROM PUBLIC;

-- ============================================================
-- 2. SECURITY: Drop old single-param overloads
-- ============================================================

DROP FUNCTION IF EXISTS public.finalizar_tentativa(uuid);
DROP FUNCTION IF EXISTS public.pausar_tentativa(uuid);

-- ============================================================
-- 3. PERFORMANCE: Drop unused indexes
-- ============================================================

DROP INDEX IF EXISTS public.idx_faculdade_ativa;
DROP INDEX IF EXISTS public.idx_faculdade_nome;
DROP INDEX IF EXISTS public.idx_questao_tema_questao_id;
DROP INDEX IF EXISTS public.idx_tema_disciplina;
DROP INDEX IF EXISTS public.idx_tentativa_user_id;
DROP INDEX IF EXISTS public.idx_gamificacao_evento_user_created;
DROP INDEX IF EXISTS public.idx_gamificacao_evento_tipo_created;
DROP INDEX IF EXISTS public.idx_questao_autor;
DROP INDEX IF EXISTS public.idx_questao_revisor;
DROP INDEX IF EXISTS public.idx_questao_formato_prova;
DROP INDEX IF EXISTS public.idx_desafio_diario_questao_id;
DROP INDEX IF EXISTS public.idx_desafio_diario_resposta_alternativa_id;
DROP INDEX IF EXISTS public.idx_user_conquista_conquista_id;
;
