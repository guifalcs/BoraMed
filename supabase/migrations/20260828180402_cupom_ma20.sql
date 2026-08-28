-- Cupom MA20 — 20% de desconto em qualquer plano, 1 uso por usuário.
--
-- Reconstrução de uma migration aplicada diretamente em produção em
-- 2026-08-28 18:04:02 (fora do fluxo normal, sem arquivo local correspondente).
-- Este arquivo apenas documenta o estado já existente em prod — mesma
-- configuração do MARIBRASIL (20260813205827): `plano_id = null` vale para
-- qualquer plano ativo, `max_por_usuario = 1`, `max_usos = null` (sem teto
-- global) e sem `expira_em` (vale até ser desativado manualmente com
-- ativo = false).

insert into public.cupom (
  codigo, descricao, tipo, valor, plano_id, ativo, expira_em, max_usos, max_por_usuario
)
values (
  'MA20', 'Campanha MA — 20% em qualquer plano', 'percentual', 20,
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
