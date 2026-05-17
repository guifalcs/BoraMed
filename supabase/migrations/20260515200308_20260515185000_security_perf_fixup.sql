-- Revoke anon access from all SECURITY DEFINER RPCs that require authentication
revoke execute on function public.atualizar_user_gamificacao_stats()                         from anon;
revoke execute on function public.conceder_xp_tentativa(uuid)                               from anon;
revoke execute on function public.get_desafio_diario()                                      from anon;
revoke execute on function public.get_meu_xp()                                              from anon;
revoke execute on function public.get_minha_posicao_ranking()                               from anon;
revoke execute on function public.get_minhas_conquistas()                                   from anon;
revoke execute on function public.get_ranking_global(integer)                               from anon;
revoke execute on function public.get_ranking_semana(integer)                               from anon;
revoke execute on function public.get_streak_estudo()                                       from anon;
revoke execute on function public.get_streak_estudo_v2()                                    from anon;
revoke execute on function public.responder_desafio_diario(uuid, integer)                   from anon;
revoke execute on function public.sync_profile_competir_publico()                           from anon;
revoke execute on function public.verificar_conquistas_usuario(uuid)                        from anon;

-- Covering indexes for unindexed foreign keys
create index if not exists idx_desafio_diario_questao_id
  on public.desafio_diario using btree (questao_id);

create index if not exists idx_desafio_diario_resposta_alternativa_id
  on public.desafio_diario_resposta using btree (alternativa_id);

create index if not exists idx_user_conquista_conquista_id
  on public.user_conquista using btree (conquista_id);;
