-- Ajuste do guard anti-race de cupom (criado em 20260818121000).
--
-- O trigger anterior validava no INSERT contando intenções "não recusadas" —
-- mais restritivo que validar_cupom (que conta só status = 'aprovada', ou seja,
-- cupom só é consumido quando o pagamento cai). Isso bloquearia retry legítimo
-- de checkout abandonado (intenção 'criada'/'pendente' pendurada).
--
-- Semântica correta: o consumo do cupom acontece na TRANSIÇÃO para 'aprovada'.
-- É aí que o guard valida, com FOR UPDATE na linha do cupom serializando duas
-- aprovações concorrentes — a segunda conta a primeira e falha, em vez de
-- ambas passarem (como acontecia com o par validar_cupom + insert sem lock).
create or replace function public.pagamento_intencao_valida_cupom()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cupom public.cupom%rowtype;
  v_qtd integer;
begin
  if new.cupom_id is null or new.status <> 'aprovada' then
    return new;
  end if;

  -- Já estava aprovada com o mesmo cupom: não é uma transição de consumo.
  if tg_op = 'UPDATE' and old.status = 'aprovada'
     and old.cupom_id is not distinct from new.cupom_id then
    return new;
  end if;

  -- Lock serializa aprovações concorrentes com o mesmo cupom.
  select * into v_cupom from public.cupom where id = new.cupom_id for update;
  if not found then
    raise exception 'cupom_invalido' using errcode = 'P0016';
  end if;

  if v_cupom.max_usos is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = new.cupom_id
        and pi.status = 'aprovada'
        and pi.id <> new.id;
    if v_qtd >= v_cupom.max_usos then
      raise exception 'cupom_esgotado' using errcode = 'P0016';
    end if;
  end if;

  if v_cupom.max_por_usuario is not null and new.user_id is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = new.cupom_id
        and pi.user_id = new.user_id
        and pi.status = 'aprovada'
        and pi.id <> new.id;
    if v_qtd >= v_cupom.max_por_usuario then
      raise exception 'cupom_ja_usado' using errcode = 'P0016';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists pagamento_intencao_cupom_guard on public.pagamento_intencao;
create trigger pagamento_intencao_cupom_guard
  before insert or update of status on public.pagamento_intencao
  for each row execute function public.pagamento_intencao_valida_cupom();
