-- Revogar acesso anon às funcoes de trigger (flagradas pelo advisor)
revoke execute on function public.trg_fn_comentario_validar_parent() from anon;
revoke execute on function public.trg_fn_comentario_voto_recalcular() from anon;
revoke execute on function public.trg_fn_comentario_validar_parent() from public;
revoke execute on function public.trg_fn_comentario_voto_recalcular() from public;

-- Indice para FK user_id em questao_comentario_denuncia (advisor de performance)
create index if not exists idx_questao_comentario_denuncia_user_id
  on public.questao_comentario_denuncia (user_id);;
