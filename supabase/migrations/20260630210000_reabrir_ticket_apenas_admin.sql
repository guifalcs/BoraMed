-- Reabrir chamado de suporte passa a ser uma ação exclusiva do admin.
-- Antes, o próprio usuário podia reabrir um chamado resolvido; agora apenas
-- quem tem is_admin() = true pode fazê-lo (o usuário deve abrir um novo chamado).

CREATE OR REPLACE FUNCTION public.reabrir_ticket(p_ticket_id UUID)
RETURNS public.suporte_tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_ticket public.suporte_tickets;
  v_ticket_atualizado public.suporte_tickets;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem reabrir chamados';
  END IF;

  SELECT *
  INTO v_ticket
  FROM public.suporte_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado nao encontrado';
  END IF;

  IF v_ticket.status <> 'resolvido' THEN
    RAISE EXCEPTION 'Apenas chamados resolvidos podem ser reabertos';
  END IF;

  UPDATE public.suporte_tickets
  SET status = 'aberto'
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket_atualizado;

  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (p_ticket_id, v_uid, 'Chamado reaberto pela equipe de suporte.', true);

  IF v_ticket.user_id <> v_uid THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    VALUES (
      v_ticket.user_id,
      'info',
      'Chamado reaberto',
      'Seu chamado "' || v_ticket.titulo || '" foi reaberto pela equipe de suporte.'
    );
  END IF;

  RETURN v_ticket_atualizado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reabrir_ticket(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.reabrir_ticket(UUID) TO authenticated;
