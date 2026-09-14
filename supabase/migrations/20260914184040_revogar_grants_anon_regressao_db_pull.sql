-- ============================================================================
-- Revoga os grants de `anon` nas 17 tabelas do schema public que ainda os
-- tinham.
--
-- Contexto: nenhuma dessas tabelas estava exposta na prática -- TODAS as
-- policies de RLS delas são escopadas para o role `authenticated`, então o
-- `anon` já recebia zero linhas. O problema é que o grant em si é a regressão
-- conhecida do `db pull`/`db diff`: o autogerado re-emite os grants default do
-- PostgREST e desfaz o hardening. Com o grant presente, a única coisa que
-- separava dado de usuário da anon key (pública no frontend) era a policy.
-- Aqui devolvemos a segunda camada.
--
-- Verificado antes de aplicar: revogar muda o retorno de "lista vazia" para
-- `42501 permission denied`, então checamos se algum caminho deslogado do
-- frontend consulta essas tabelas. Não consulta -- /planos e /checkout/* estão
-- atrás do `lazyAuthGuard` e a landing pública usa planos hardcoded (há um
-- TODO no landing.component.ts para trocar por listarPlanos()). Se esse TODO
-- for implementado, a seção de planos da landing vai precisar de uma policy
-- para `anon` em public.plano + o grant de SELECT de volta.
--
-- questao_backup_formatacao também perde o grant de `authenticated`: é tabela
-- de backup da normalização de 18/08 (RLS ligada, sem policy), mesmo
-- tratamento dado a backup_tentativa_arthur_20260910.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- É exatamente esse fluxo que reabriu os grants revogados aqui.
-- ============================================================================

revoke all on table public.assinatura from anon;
revoke all on table public.avisos from anon;
revoke all on table public.avisos_vistos from anon;
revoke all on table public.comissao_competencia from anon;
revoke all on table public.cupom from anon;
revoke all on table public.despesa from anon;
revoke all on table public.disciplina from anon;
revoke all on table public.notificacoes from anon;
revoke all on table public.pagamento from anon;
revoke all on table public.pagamento_intencao from anon;
revoke all on table public.plano from anon;
revoke all on table public.profiles from anon;
revoke all on table public.prova_questao from anon;
revoke all on table public.questao_backup_formatacao from anon;
revoke all on table public.suporte_faq from anon;
revoke all on table public.suporte_mensagens from anon;
revoke all on table public.suporte_tickets from anon;

revoke all on table public.questao_backup_formatacao from authenticated;
