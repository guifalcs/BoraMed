-- Segurança CRÍTICO 2 — impedir que o aluno forje nota/acertos/status escrevendo
-- direto em `tentativa`/`tentativa_resposta`.
--
-- Todas as escritas dessas tabelas já passam por RPCs SECURITY DEFINER
-- (iniciar_tentativa, salvar_resposta_tentativa, pausar_tentativa,
--  retomar_tentativa, finalizar_tentativa). O frontend só faz SELECT direto.
-- Logo, revogar a escrita direta NÃO quebra o app e fecha o farm de XP/ranking.

REVOKE INSERT, UPDATE, DELETE ON public.tentativa          FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tentativa_resposta FROM authenticated;

-- Remover as policies de escrita (sem WITH CHECK de coluna, permitiam reescrever
-- acertos/nota/status da própria tentativa). As policies de SELECT permanecem,
-- já escopadas por dono/is_admin().
DROP POLICY IF EXISTS tentativa_insert_own          ON public.tentativa;
DROP POLICY IF EXISTS tentativa_update_own          ON public.tentativa;
DROP POLICY IF EXISTS tentativa_resposta_insert_own ON public.tentativa_resposta;
DROP POLICY IF EXISTS tentativa_resposta_update_own ON public.tentativa_resposta;
