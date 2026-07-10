-- Agenda a reconciliação periódica das assinaturas recorrentes: o pg_cron
-- chama a edge function mp-reconciliar-assinaturas de hora em hora via pg_net.
-- A function sincroniza 1ª cobrança aprovada com webhook perdido, cancela o
-- preapproval quando a 1ª cobrança é recusada (sem retry de 30 dias) e alerta
-- assinaturas sem fatura após 24h.
--
-- Pré-requisitos POR AMBIENTE (uma vez, fora da migration — são secrets):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<valor de CRON_SECRET>', 'cron_secret');
-- e o mesmo CRON_SECRET nos secrets das edge functions:
--   npx supabase secrets set CRON_SECRET=<valor>

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotente: remove o job se já existir antes de (re)agendar.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mp-reconciliar-assinaturas') then
    perform cron.unschedule('mp-reconciliar-assinaturas');
  end if;
end
$$;

-- Minuto 7 de cada hora (evita o pico de jobs do minuto 0).
select cron.schedule(
  'mp-reconciliar-assinaturas',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/mp-reconciliar-assinaturas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
