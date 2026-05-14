-- Revoga permissão de EXECUTE do role PUBLIC (herdado por anon e authenticated)
-- em todas as RPCs que exigem autenticação, e concede apenas para authenticated.
-- Essas funções usam SECURITY DEFINER e validam auth.uid() internamente,
-- mas não devem ser acessíveis sem login.

REVOKE EXECUTE ON FUNCTION public.finalizar_tentativa(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalizar_tentativa(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_desempenho_por_tema() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_historico_kpis() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_temas_com_contagem() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pausar_tentativa(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pausar_tentativa(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retomar_tentativa(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finalizar_tentativa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_tentativa(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_desempenho_por_tema() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_historico_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_temas_com_contagem() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_tentativa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_tentativa(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retomar_tentativa(uuid) TO authenticated;
