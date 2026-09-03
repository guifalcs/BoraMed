-- Cupom IZA15 — 15% de desconto em qualquer plano, 1 uso por usuário.
--
-- Mesma configuração do MA20 (20260828180402), só muda o código, a descrição e
-- o percentual: `plano_id = null` vale para qualquer plano ativo,
-- `max_por_usuario = 1`, `max_usos = null` (sem teto global) e sem `expira_em`
-- (vale até ser desativado manualmente com ativo = false).
--
-- O uso por usuário é contado por validar_cupom apenas sobre
-- pagamento_intencao.status = 'aprovada': o cupom só é consumido quando o
-- pagamento caiu e o acesso foi liberado — checkout abandonado, Pix pendente ou
-- recusa não gastam o cupom.

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
