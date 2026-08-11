-- Cupom YAS20 — 20% de desconto em qualquer plano, 1 uso por usuário.
--
-- `plano_id = null` = vale para qualquer plano ativo (validar_cupom só restringe
-- quando plano_id não é nulo).
-- `max_por_usuario = 1` e `max_usos = null` (sem teto global): a contagem de uso
-- por usuário em validar_cupom considera apenas pagamento_intencao.status =
-- 'aprovada' — ou seja, o cupom só é consumido quando o pagamento caiu e o acesso
-- foi liberado; tentativa abandonada, Pix pendente ou recusa não gastam o cupom.
-- Sem `expira_em`: o cupom vale até ser desativado manualmente (ativo = false).

insert into public.cupom (
  codigo, descricao, tipo, valor, plano_id, ativo, expira_em, max_usos, max_por_usuario
)
values (
  'YAS20', 'Campanha YAS — 20% em qualquer plano', 'percentual', 20,
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
