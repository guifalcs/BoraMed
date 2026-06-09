-- Segurança BAIXO/endurecimento — funções SECURITY DEFINER com search_path fixo
-- devem incluir pg_temp para evitar resolução de objetos via schema temporário.
-- Antes: SET search_path = 'public'. Agora: 'public', 'pg_temp'.

ALTER FUNCTION public.is_admin(uuid)                                  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.is_super_admin(uuid)                            SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.admin_get_stats()                              SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.prevent_papel_change()                        SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.admin_enviar_notificacao(text, text, text, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_historico_kpis()                          SET search_path TO 'public', 'pg_temp';
