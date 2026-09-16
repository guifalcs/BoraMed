-- ============================================================================
-- Tranca a tabela de backup manual backup_tentativa_arthur_20260910.
--
-- A tabela foi criada direto em produção (10/09), fora do fluxo de migrations,
-- como backup pontual antes de um fix nas tentativas de um aluno. Nasceu com
-- os grants default do PostgREST e SEM row level security -- ou seja, as 156
-- linhas estavam legíveis E graváveis por qualquer um com a anon key, que é
-- pública no frontend. Era a única tabela do schema public sem RLS.
--
-- Não dropamos porque o backup não é redundante: das 156 tentativas, só 50
-- ainda existem em public.tentativa (106 foram deletadas) e 44 dessas 50
-- divergem em nota/acertos/pontos. É o único registro que resta delas.
--
-- Tratamento: mesmo padrão de mp_webhook_evento -- revoke total nos roles
-- expostos + RLS habilitada sem nenhuma policy. Assim a tabela fica acessível
-- apenas por service_role (que faz bypass de RLS), que é o que se espera de um
-- backup operacional.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- O autogerado re-emite os grants default e reabre a tabela.
--
-- ⚠️ POR QUE O GUARD `to_regclass`: a tabela só existe em produção, porque foi
-- criada à mão lá. Num banco que nasce das migrations (local e o job
-- `db-security` do CI) ela nunca existiu, e os comandos abaixo quebravam com
-- 42P01 -- derrubando `supabase db reset` e todo o CI a partir de 14/09/2026.
-- O guard torna a migration re-executável em qualquer banco sem mudar nada em
-- produção, onde a tabela existe e o bloco roda igual ao original.
-- ============================================================================

do $$
begin
  if to_regclass('public.backup_tentativa_arthur_20260910') is null then
    raise notice 'backup_tentativa_arthur_20260910 nao existe neste banco; nada a trancar';
    return;
  end if;

  revoke all on table public.backup_tentativa_arthur_20260910 from anon;
  revoke all on table public.backup_tentativa_arthur_20260910 from authenticated;

  alter table public.backup_tentativa_arthur_20260910 enable row level security;

  comment on table public.backup_tentativa_arthur_20260910 is
    'Backup manual (10/09/2026) de 156 tentativas de um aluno, feito antes de um '
    'fix de dados. 106 dessas tentativas não existem mais em public.tentativa. '
    'Trancada: RLS sem policy + sem grants -- só service_role enxerga.';
end $$;
