-- Corrige funções que inserem em notificacoes para SECURITY DEFINER
-- SECURITY INVOKER bloqueava por falta de INSERT policy em notificacoes

CREATE OR REPLACE FUNCTION public.criar_ticket(
  p_titulo    TEXT,
  p_descricao TEXT,
  p_categoria TEXT
)
RETURNS public.suporte_tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket public.suporte_tickets;
BEGIN
  INSERT INTO public.suporte_tickets (user_id, titulo, descricao, categoria)
  VALUES ((SELECT auth.uid()), p_titulo, p_descricao, p_categoria)
  RETURNING * INTO v_ticket;

  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (v_ticket.id, (SELECT auth.uid()), p_descricao, false);

  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
  VALUES (
    (SELECT auth.uid()),
    'info',
    'Solicitação recebida',
    'Recebemos sua solicitação "' || p_titulo || '". Em breve entraremos em contato.'
  );

  RETURN v_ticket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_ticket(TEXT,TEXT,TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.criar_ticket(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_responder_ticket(p_ticket_id UUID, p_mensagem TEXT)
RETURNS public.suporte_mensagens
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg    public.suporte_mensagens;
  v_ticket public.suporte_tickets;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  SELECT * INTO v_ticket FROM public.suporte_tickets WHERE id = p_ticket_id;

  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (p_ticket_id, (SELECT auth.uid()), p_mensagem, true)
  RETURNING * INTO v_msg;

  UPDATE public.suporte_tickets
  SET status = 'em_andamento'
  WHERE id = p_ticket_id AND status = 'aberto';

  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
  VALUES (
    v_ticket.user_id,
    'info',
    'Resposta no seu chamado',
    'Você recebeu uma resposta no chamado "' || v_ticket.titulo || '".'
  );

  RETURN v_msg;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_responder_ticket(UUID,TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_responder_ticket(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_atualizar_status_ticket(p_ticket_id UUID, p_status TEXT)
RETURNS public.suporte_tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket public.suporte_tickets;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  UPDATE public.suporte_tickets
  SET status = p_status
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  IF p_status = 'resolvido' THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    VALUES (
      v_ticket.user_id,
      'info',
      'Chamado resolvido',
      'Seu chamado "' || v_ticket.titulo || '" foi marcado como resolvido.'
    );
  END IF;

  RETURN v_ticket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_atualizar_status_ticket(UUID,TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_atualizar_status_ticket(UUID,TEXT) TO authenticated;
