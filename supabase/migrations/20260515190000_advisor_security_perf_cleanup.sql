-- Resolve Supabase advisor warnings (security + performance)
-- Security: revoke EXECUTE on internal/trigger functions not meant to be called via API
-- Security: drop deprecated single-param overloads replaced by DEFAULT-param versions
-- Performance: drop unused indexes

BEGIN;

-- ============================================================
-- 1. SECURITY: Revoke EXECUTE on internal/trigger functions
--    These are called internally by triggers or other functions,
--    not directly by users via PostgREST.
-- ============================================================

-- atualizar_user_gamificacao_stats() — trigger on user_gamificacao_stats
REVOKE EXECUTE ON FUNCTION public.atualizar_user_gamificacao_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_user_gamificacao_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_user_gamificacao_stats() FROM PUBLIC;

-- sync_profile_competir_publico() — trigger on profiles
REVOKE EXECUTE ON FUNCTION public.sync_profile_competir_publico() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_competir_publico() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_competir_publico() FROM PUBLIC;

-- verificar_conquistas_usuario(uuid) — internal helper called by conceder_xp, get_minhas_conquistas
REVOKE EXECUTE ON FUNCTION public.verificar_conquistas_usuario(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verificar_conquistas_usuario(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verificar_conquistas_usuario(uuid) FROM PUBLIC;

-- ============================================================
-- 2. SECURITY: Drop old single-param overloads
--    The 2-param versions (with DEFAULT NULL) cover single-param calls.
-- ============================================================

DROP FUNCTION IF EXISTS public.finalizar_tentativa(uuid);
DROP FUNCTION IF EXISTS public.pausar_tentativa(uuid);

-- ============================================================
-- 3. PERFORMANCE: Drop unused indexes
--    All flagged as never used by pg_stat_user_indexes.
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

COMMIT;
