-- Reparo de reprodutibilidade: notificar_nova_assinatura() e seu trigger foram
-- criados manualmente em produção e nunca entraram nas migrations, o que fazia
-- o `db reset` local falhar em 20260717130247 (hardening referencia a função).
-- Definição copiada de produção (pg_get_functiondef, 2026-07-17). Idempotente:
-- em produção, reaplicar produz o mesmo estado.

create or replace function public.notificar_nova_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (TG_OP = 'INSERT' and NEW.status = 'authorized') or
     (TG_OP = 'UPDATE' and NEW.status = 'authorized' and OLD.status <> 'authorized') then

    if not exists (
      select 1 from public.notificacoes
      where user_id = NEW.user_id
        and titulo = 'Bem-vindo à comunidade BoraMed!'
    ) then
      insert into public.notificacoes (user_id, tipo, titulo, mensagem, dados)
      values (
        NEW.user_id,
        'info',
        'Bem-vindo à comunidade BoraMed!',
        'Que bom ter você aqui! Acesse nossa comunidade exclusiva no WhatsApp para trocar dicas, tirar dúvidas e se conectar com outros estudantes de medicina.',
        '{"link": "https://chat.whatsapp.com/JriNxPNzlmp3JJLTrL9rFi", "link_label": "Entrar na comunidade"}'::jsonb
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trigger_notificar_nova_assinatura on public.assinatura;
create trigger trigger_notificar_nova_assinatura
  after insert or update of status on public.assinatura
  for each row execute function public.notificar_nova_assinatura();
