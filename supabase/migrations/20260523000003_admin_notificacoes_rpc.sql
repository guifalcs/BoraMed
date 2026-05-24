-- RPC: admin envia notificação para um usuário ou todos
CREATE OR REPLACE FUNCTION public.admin_enviar_notificacao(
  p_tipo    TEXT,
  p_titulo  TEXT,
  p_mensagem TEXT DEFAULT NULL,
  p_user_id UUID  DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  IF p_tipo NOT IN ('sistema', 'conquista', 'info', 'aviso') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = 'P0001';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    VALUES (p_user_id, p_tipo, p_titulo, p_mensagem);
    RETURN 1;
  ELSE
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    SELECT id, p_tipo, p_titulo, p_mensagem FROM auth.users;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_enviar_notificacao(TEXT, TEXT, TEXT, UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_enviar_notificacao(TEXT, TEXT, TEXT, UUID) TO authenticated;

-- RPC: admin lista notificações enviadas (com email do destinatário)
CREATE OR REPLACE FUNCTION public.admin_listar_notificacoes(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id        UUID,
  user_id   UUID,
  user_email TEXT,
  tipo      TEXT,
  titulo    TEXT,
  mensagem  TEXT,
  lida      BOOLEAN,
  criado_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    n.id, n.user_id,
    u.email::TEXT,
    n.tipo, n.titulo, n.mensagem, n.lida, n.criado_em
  FROM public.notificacoes n
  JOIN auth.users u ON u.id = n.user_id
  ORDER BY n.criado_em DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_notificacoes(INT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_notificacoes(INT) TO authenticated;
