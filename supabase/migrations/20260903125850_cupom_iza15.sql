-- Cupom IZA15 — 15% de desconto em qualquer plano, 1 uso por usuário.
--
-- Reconstrução de uma migration aplicada diretamente em produção em
-- 2026-09-03 12:58:50 (fora do fluxo normal, sem arquivo local
-- correspondente) — mesmo caso do MA20 (20260828180402) e do MARIBRASIL
-- (20260813205827). Este arquivo apenas documenta o estado já existente em
-- prod: `plano_id = null` vale para qualquer plano ativo, `max_por_usuario = 1`,
-- `max_usos = null` (sem teto global) e sem `expira_em` (vale até ser
-- desativado manualmente com ativo = false).
--
-- SQL idêntico ao registrado em supabase_migrations.schema_migrations do ref de
-- produção, para que `db push` volte a reconhecer o histórico remoto.

insert into public.cupom (
  codigo, descricao, tipo, valor, plano_id, ativo, expira_em, max_usos, max_por_usuario
)
values (
  'IZA15', 'Campanha Izadora — 15% em qualquer plano', 'percentual', 15,
  null, true, null, null, 1
)
on conflict (codigo) do update set
  descricao       = excluded.descricao,
  tipo            = excluded.tipo,
  valor           = excluded.valor,
  plano_id        = excluded.plano_id,
  ativo           = excluded.ativo,
  expira_em       = excluded.expira_em,
  max_usos        = excluded.max_usos,
  max_por_usuario = excluded.max_por_usuario;
