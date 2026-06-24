-- ============================================================
-- Corrige a contagem de provas no dashboard admin (admin_get_stats).
--
-- Problema: ao montar um simulado, o sistema insere uma linha na tabela
-- `prova` com `periodo = 0` e `origem = 'personalizado'` (prova montada).
-- O módulo de provas do admin já oculta essas linhas filtrando por
-- `periodo > 0`, mas o KPI `total_provas` contava TODAS as linhas da tabela,
-- inflando o número com provas montadas que não aparecem no módulo.
--
-- Correção: contar apenas provas reais (nacionais/cadastradas), aplicando o
-- mesmo critério usado na listagem do módulo (`periodo > 0`).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
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
    'total_provas',      (SELECT COUNT(*) FROM public.prova WHERE periodo > 0),
    'total_tentativas',  (SELECT COUNT(*) FROM public.tentativa),
    'tentativas_hoje',   (SELECT COUNT(*) FROM public.tentativa WHERE criado_em::date = CURRENT_DATE),
    'total_temas',       (SELECT COUNT(*) FROM public.tema)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_stats() TO authenticated;
