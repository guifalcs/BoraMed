-- ============================================================
-- Grants que faltaram em 20260730120000_campanhas_email_resend.sql
--
-- Sintoma: o disparo falhava com "falha ao registrar a campanha" e o log da
-- edge function mostrava `permission denied for table email_campanha`. O modo
-- 'teste' funcionava porque não toca nessas tabelas — daí a impressão de que
-- "o e-mail chega mas a campanha não registra".
--
-- Causa: neste projeto o ALTER DEFAULT PRIVILEGES do schema public já não dá
-- DML para anon/authenticated/service_role (sobrou só Dxtm — TRUNCATE,
-- REFERENCES, TRIGGER, MAINTAIN). Toda tabela nova nasce SEM select/insert/
-- update/delete para o service_role e precisa de GRANT explícito. Confira com:
--
--   select defaclacl from pg_default_acl
--    where defaclnamespace = 'public'::regnamespace and defaclrole = 'postgres'::regrole;
--
-- Escopo mínimo, espelhando o que a function realmente faz:
--   * INSERT   — cria a campanha e as linhas de destinatário;
--   * UPDATE   — status/totais da campanha e status/resend_id por destinatário;
--   * SELECT   — retomada (lê pendentes) e contagem final por status.
-- Sem DELETE: a function nunca apaga histórico de campanha.
--
-- Nada para anon/authenticated de propósito: o admin lê pelas RPCs
-- `admin_listar_campanhas_email` e `admin_contar_publico_email`, que são
-- SECURITY DEFINER e não dependem de grant na tabela. As policies de leitura
-- por admin criadas na migration anterior seguem valendo como segunda camada,
-- caso um grant direto seja concedido no futuro.
-- ============================================================

-- Primeiro fecha o excesso. O default privileges NÃO é igual nos dois
-- ambientes: no banco local sobrou só `Dxtm` (daí o erro de permissão), mas em
-- produção ainda é `arwdDxtm` para anon/authenticated/service_role — lá estas
-- tabelas nasceriam com INSERT/UPDATE/DELETE para o cliente, seguradas apenas
-- pela RLS (que não tem policy de escrita). Grant largo + RLS é uma camada a
-- menos do que o resto do projeto assume, e histórico de campanha não deve ser
-- alcançável pelo cliente em nenhuma hipótese.
--
-- Tirar SELECT de authenticated não quebra a tela: o admin lê por
-- `admin_listar_campanhas_email`, que é SECURITY DEFINER. A policy de SELECT por
-- admin criada na migration anterior fica como segunda camada, para o dia em
-- que um grant direto for concedido.
REVOKE ALL ON public.email_campanha              FROM anon, authenticated;
REVOKE ALL ON public.email_campanha_destinatario FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.email_campanha              TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.email_campanha_destinatario TO service_role;
