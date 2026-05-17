-- Concede INSERT/UPDATE/DELETE para authenticated nas tabelas que o admin escreve.
-- A segurança real é garantida pelas políticas RLS (apenas is_admin() pode escrever).
GRANT INSERT, UPDATE, DELETE ON public.questao      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.alternativa  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.questao_tema TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tema         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.prova        TO authenticated;;
