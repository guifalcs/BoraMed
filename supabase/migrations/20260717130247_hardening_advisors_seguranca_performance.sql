-- Hardening pós-auditoria dos advisors (17/07/2026): segurança + performance.

-- ============================================================
-- 1) SECURITY DEFINER: revoga EXECUTE indevido
-- ============================================================
-- RPCs que nunca devem ser chamáveis por anon (grant default vazado)
revoke execute on function public.admin_get_metricas_ia() from public, anon;
revoke execute on function public.toggle_favorito_tentativa(uuid, boolean) from public, anon;

-- Trigger functions executam como owner da tabela; nenhum role de cliente
-- precisa de EXECUTE nelas
revoke execute on function public.notificar_nova_assinatura() from public, anon, authenticated;
revoke execute on function public.snapshot_prova_em_tentativas() from public, anon, authenticated;
revoke execute on function public.trg_fn_flashcard_cards_recalcular() from public, anon, authenticated;
revoke execute on function public.trg_fn_flashcard_deck_likes_recalcular() from public, anon, authenticated;
revoke execute on function public.trg_fn_comentario_validar_parent() from public, anon, authenticated;
revoke execute on function public.trg_fn_comentario_voto_recalcular() from public, anon, authenticated;

-- Funções novas não nascem mais executáveis por anon/PUBLIC (grant a
-- authenticated/service_role permanece no default)
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- ============================================================
-- 2) search_path fixo na única função que faltava
-- ============================================================
alter function public.notificar_nova_assinatura() set search_path = public, pg_temp;

-- ============================================================
-- 3) RLS initplan: auth.uid()/is_admin() avaliados uma vez por
--    query em vez de por linha
-- ============================================================
alter policy assinatura_select_own on public.assinatura
  using (user_id = (select auth.uid()) or (select is_admin()));

alter policy pagamento_select_own on public.pagamento
  using (user_id = (select auth.uid()) or (select is_admin()));

alter policy plano_select_ativos on public.plano
  using (ativo or (select is_admin()));

-- ============================================================
-- 4) Policies FOR ALL de admin viram INSERT/UPDATE/DELETE para
--    não somar um SELECT permissivo extra em toda leitura.
--    O SELECT de admin segue garantido pelas policies *_select,
--    que já incluem is_admin().
-- ============================================================
drop policy plano_admin_all on public.plano;
create policy plano_admin_insert on public.plano
  for insert to authenticated with check ((select is_admin()));
create policy plano_admin_update on public.plano
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy plano_admin_delete on public.plano
  for delete to authenticated using ((select is_admin()));

drop policy flashcard_decks_admin_write on public.flashcard_decks;
create policy flashcard_decks_admin_insert on public.flashcard_decks
  for insert to authenticated with check ((select is_admin()));
create policy flashcard_decks_admin_update on public.flashcard_decks
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy flashcard_decks_admin_delete on public.flashcard_decks
  for delete to authenticated using ((select is_admin()));

drop policy flashcard_cards_admin_write on public.flashcard_cards;
create policy flashcard_cards_admin_insert on public.flashcard_cards
  for insert to authenticated with check ((select is_admin()));
create policy flashcard_cards_admin_update on public.flashcard_cards
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy flashcard_cards_admin_delete on public.flashcard_cards
  for delete to authenticated using ((select is_admin()));

drop policy material_arquivo_write on public.material_arquivo;
create policy material_arquivo_admin_insert on public.material_arquivo
  for insert to authenticated with check ((select is_admin()));
create policy material_arquivo_admin_update on public.material_arquivo
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy material_arquivo_admin_delete on public.material_arquivo
  for delete to authenticated using ((select is_admin()));

drop policy material_categoria_write on public.material_categoria;
create policy material_categoria_admin_insert on public.material_categoria
  for insert to authenticated with check ((select is_admin()));
create policy material_categoria_admin_update on public.material_categoria
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy material_categoria_admin_delete on public.material_categoria
  for delete to authenticated using ((select is_admin()));

drop policy material_topico_write on public.material_topico;
create policy material_topico_admin_insert on public.material_topico
  for insert to authenticated with check ((select is_admin()));
create policy material_topico_admin_update on public.material_topico
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy material_topico_admin_delete on public.material_topico
  for delete to authenticated using ((select is_admin()));

-- ============================================================
-- 5) Storage: bucket flashcard-imagens não permite mais listar
--    todos os arquivos (conteúdo paywalled). App usa apenas
--    upload/getPublicUrl/remove — nada depende de list/download.
-- ============================================================
drop policy flashcard_imagens_select on storage.objects;
create policy flashcard_imagens_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'flashcard-imagens'
    and (
      (select is_admin())
      or (
        (storage.foldername(name))[1] = 'user'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
    )
  );

-- ============================================================
-- 6) Índices de cobertura para FKs sem índice
-- ============================================================
create index if not exists idx_assinatura_plano_id on public.assinatura (plano_id);
create index if not exists idx_ia_agente_atualizado_por on public.ia_agente (atualizado_por);
create index if not exists idx_profiles_banido_por on public.profiles (banido_por);
create index if not exists idx_suporte_anexos_user_id on public.suporte_anexos (user_id);
create index if not exists idx_suporte_mensagens_autor_id on public.suporte_mensagens (autor_id);
