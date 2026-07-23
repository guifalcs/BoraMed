-- Cupom só é "consumido" quando o pagamento foi APROVADO.
--
-- Antes: validar_cupom contava como uso qualquer intenção não recusada/expirada/
-- cancelada — ou seja, um checkout abandonado (status 'processando') ou um Pix/
-- boleto ainda não pago ('pendente') já gastava o cupom na conta do usuário.
-- Agora conta apenas status = 'aprovada' (pagamento concluído / assinou), tanto
-- no limite por usuário quanto no limite total. Redefinição via CREATE OR REPLACE
-- reafirma os grants (regra anti-regressão do projeto).

create or replace function public.validar_cupom(
  p_codigo text,
  p_plano_slug text,
  p_user_id uuid default null
)
returns table (
  valido boolean,
  motivo text,
  cupom_id uuid,
  valor_original_centavos integer,
  desconto_centavos integer,
  valor_final_centavos integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cupom public.cupom%rowtype;
  v_plano public.plano%rowtype;
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_qtd integer;
  v_desc integer;
begin
  select * into v_plano from public.plano where slug = p_plano_slug and ativo = true;
  if not found then
    return query select false, 'plano_invalido', null::uuid, null::integer, null::integer, null::integer;
    return;
  end if;

  select * into v_cupom from public.cupom where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or not v_cupom.ativo then
    return query select false, 'invalido', null::uuid, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  if v_cupom.expira_em is not null and v_cupom.expira_em < now() then
    return query select false, 'expirado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  if v_cupom.plano_id is not null and v_cupom.plano_id <> v_plano.id then
    return query select false, 'nao_aplicavel', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
    return;
  end if;

  -- Uso "consumido" = pagamento APROVADO (concluído). Intenção pendente/processando
  -- (checkout não finalizado, Pix/boleto não pago) NÃO gasta o cupom.
  if v_cupom.max_usos is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = v_cupom.id
        and pi.status = 'aprovada';
    if v_qtd >= v_cupom.max_usos then
      return query select false, 'esgotado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
      return;
    end if;
  end if;

  if v_cupom.max_por_usuario is not null and v_user is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = v_cupom.id
        and pi.user_id = v_user
        and pi.status = 'aprovada';
    if v_qtd >= v_cupom.max_por_usuario then
      return query select false, 'ja_usado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
      return;
    end if;
  end if;

  if v_cupom.tipo = 'percentual' then
    v_desc := round(v_plano.preco_centavos * v_cupom.valor / 100.0);
  else
    v_desc := v_cupom.valor;
  end if;
  if v_desc < 0 then v_desc := 0; end if;
  if v_desc > v_plano.preco_centavos then v_desc := v_plano.preco_centavos; end if;

  return query select true, 'ok', v_cupom.id,
    v_plano.preco_centavos, v_desc, v_plano.preco_centavos - v_desc;
end;
$$;

revoke all on function public.validar_cupom(text, text, uuid) from public;
grant execute on function public.validar_cupom(text, text, uuid) to authenticated, service_role;
