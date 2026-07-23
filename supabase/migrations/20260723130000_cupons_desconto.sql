-- Cupons de desconto no checkout embutido (pagamento único / acesso_unico).
--
-- O preço cobrado é SEMPRE recalculado no servidor (edge mp-processar-pagamento)
-- a partir de `plano.preco_centavos`; o cupom entra nesse mesmo ponto. A função
-- `validar_cupom` é a fonte única de validação — reusada pelo frontend (exibir o
-- preço com desconto) e pela edge (aplicar de fato). O snapshot do cupom aplicado
-- fica em pagamento_intencao.cupom_id/desconto_centavos, espelhando valor_centavos.
--
-- Escopo inicial (seed): CALOURO20 = 20% no Avançado Semestral, 1 uso por usuário,
-- válido até 31/07/2026.

-- ─── Tabela de cupons ────────────────────────────────────────────────────────
create table if not exists public.cupom (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  codigo text not null unique,
  descricao text,
  tipo text not null default 'percentual' check (tipo in ('percentual', 'fixo')),
  -- percentual: 1..100 (%); fixo: desconto em centavos.
  valor integer not null check (valor > 0),
  -- Restrição de plano: null = vale para qualquer plano; senão só o plano indicado.
  plano_id uuid references public.plano(id) on delete cascade,
  ativo boolean not null default true,
  expira_em timestamptz,
  max_usos integer check (max_usos is null or max_usos > 0),
  max_por_usuario integer check (max_por_usuario is null or max_por_usuario > 0),
  -- Código sempre em maiúsculas — a validação normaliza a entrada com upper().
  constraint cupom_codigo_maiusculo check (codigo = upper(codigo))
);

comment on table public.cupom is
  'Cupons de desconto do checkout; validados e aplicados server-side (edge/RPC).';

alter table public.cupom enable row level security;

-- Leitura direta só para admin (o fluxo do aluno usa a RPC security definer).
-- Escrita apenas via service_role (edge/admin) — sem policy de write.
drop policy if exists cupom_select_admin on public.cupom;
create policy cupom_select_admin on public.cupom
  for select to authenticated
  using (public.is_admin());

drop trigger if exists cupom_set_atualizado_em on public.cupom;
create trigger cupom_set_atualizado_em
  before update on public.cupom
  for each row execute function public.update_atualizado_em();

grant select on public.cupom to authenticated;
grant all on public.cupom to service_role;

-- ─── Snapshot do cupom por tentativa ─────────────────────────────────────────
alter table public.pagamento_intencao
  add column if not exists cupom_id uuid references public.cupom(id),
  add column if not exists desconto_centavos integer not null default 0
    check (desconto_centavos >= 0);

-- pagamento_intencao usa grants por coluna: colunas novas nascem SEM SELECT p/
-- authenticated (armadilha conhecida) — concede explicitamente.
grant select (cupom_id, desconto_centavos) on public.pagamento_intencao to authenticated;

create index if not exists idx_pagamento_intencao_cupom
  on public.pagamento_intencao (cupom_id) where cupom_id is not null;

-- ─── Validação central (frontend p/ exibir, edge p/ aplicar) ─────────────────
-- Retorna sempre o preço original; quando válido, o desconto e o preço final.
-- p_user_id: passado explicitamente pela edge (service_role, sem auth.uid());
-- no frontend cai em auth.uid(). Usado só para o limite por usuário.
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

  -- Usos "consumidos": intenções não recusadas/expiradas/canceladas (uma recusa
  -- libera o cupom para nova tentativa).
  if v_cupom.max_usos is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = v_cupom.id
        and pi.status not in ('recusada', 'expirada', 'cancelada');
    if v_qtd >= v_cupom.max_usos then
      return query select false, 'esgotado', v_cupom.id, v_plano.preco_centavos, 0, v_plano.preco_centavos;
      return;
    end if;
  end if;

  if v_cupom.max_por_usuario is not null and v_user is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = v_cupom.id
        and pi.user_id = v_user
        and pi.status not in ('recusada', 'expirada', 'cancelada');
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

-- ─── Seed: CALOURO20 ─────────────────────────────────────────────────────────
insert into public.cupom (codigo, descricao, tipo, valor, plano_id, ativo, expira_em, max_por_usuario)
select 'CALOURO20', 'Campanha calouro — 20% no Avançado Semestral', 'percentual', 20,
       p.id, true, '2026-07-31 23:59:59-03'::timestamptz, 1
from public.plano p
where p.slug = 'semestral'
on conflict (codigo) do nothing;
