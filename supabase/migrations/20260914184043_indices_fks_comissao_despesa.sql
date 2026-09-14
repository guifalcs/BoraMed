-- ============================================================================
-- Índices de cobertura para as 3 FKs que o advisor de performance apontava sem
-- índice. Tabelas pequenas (comissão por competência e despesas do financeiro),
-- então o ganho em SELECT é marginal hoje -- o que importa é o custo do DELETE
-- em profiles/auth.users: sem índice, remover um usuário força seq scan nessas
-- tabelas para validar a FK.
-- ============================================================================

create index if not exists idx_comissao_competencia_fechada_por
  on public.comissao_competencia (fechada_por);

create index if not exists idx_comissao_competencia_pago_por
  on public.comissao_competencia (pago_por);

create index if not exists idx_despesa_criado_por
  on public.despesa (criado_por);
