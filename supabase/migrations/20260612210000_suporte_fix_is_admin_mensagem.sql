-- Corrige enviar_mensagem_ticket: is_admin sempre false no widget (perspectiva usuário)
-- Admin usa admin_responder_ticket que já força is_admin=true
CREATE OR REPLACE FUNCTION public.enviar_mensagem_ticket(p_ticket_id UUID, p_mensagem TEXT)
RETURNS public.suporte_mensagens
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_msg public.suporte_mensagens;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.suporte_tickets t
    WHERE t.id = p_ticket_id
      AND (t.user_id = (SELECT auth.uid()) OR public.is_admin())
      AND t.status <> 'resolvido'
  ) THEN
    RAISE EXCEPTION 'Acesso negado ou ticket encerrado';
  END IF;

  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (p_ticket_id, (SELECT auth.uid()), p_mensagem, false)
  RETURNING * INTO v_msg;

  UPDATE public.suporte_tickets
  SET status = 'em_andamento'
  WHERE id = p_ticket_id AND status = 'aberto' AND public.is_admin();

  RETURN v_msg;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enviar_mensagem_ticket(UUID,TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.enviar_mensagem_ticket(UUID,TEXT) TO authenticated;
