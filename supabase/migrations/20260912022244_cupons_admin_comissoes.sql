-- ════════════════════════════════════════════════════════════════════════════
-- Módulo admin de Cupons + Comissões
--
-- 1) `cupom` ganha responsável (usuário do sistema OU nome livre — ambos
--    opcionais) e a REGRA DE COMISSÃO do cupom: percentuais distintos para
--    aluno de Ipatinga e aluno de fora, mais os tiers de plano elegíveis.
--    A regra mora no cupom (não no usuário) porque é o cupom que aparece na
--    venda; um mesmo responsável pode ter cupons com regras diferentes.
-- 2) RPCs admin de CRUD (`admin_listar_cupons`, `admin_salvar_cupom`,
--    `admin_excluir_cupom`, `admin_buscar_usuarios_cupom`).
-- 3) Apuração de comissão por COMPETÊNCIA MENSAL, com fechamento e pagamento
--    registrados em `comissao_competencia` (segundo bloco deste arquivo).
--
-- Base de cálculo da comissão: valor BRUTO pago pelo aluno
-- (`pagamento.valor_centavos`, já líquido de desconto do cupom), apenas em
-- pagamentos `approved`. Estornos/cancelamentos ficam fora.
--
-- A conta é a mesma da skill `prestacao-contas-cupom` (junção pagamento →
-- pagamento_intencao → cupom, recorte por `criado_em`, mesma base), para que o
-- PDF de repasse emitido pelo admin e o da skill nunca divirjam.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Colunas novas em cupom ──────────────────────────────────────────────
alter table public.cupom
  add column if not exists responsavel_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists responsavel_nome text,
  add column if not exists comissao_ativa boolean not null default false,
  add column if not exists comissao_pct_ipatinga numeric(5,2) not null default 0,
  add column if not exists comissao_pct_fora numeric(5,2) not null default 0,
  add column if not exists comissao_planos_avancado boolean not null default true,
  add column if not exists comissao_planos_essencial boolean not null default true;

alter table public.cupom
  drop constraint if exists cupom_comissao_pct_ipatinga_range;
alter table public.cupom
  add constraint cupom_comissao_pct_ipatinga_range
  check (comissao_pct_ipatinga >= 0 and comissao_pct_ipatinga <= 100);

alter table public.cupom
  drop constraint if exists cupom_comissao_pct_fora_range;
alter table public.cupom
  add constraint cupom_comissao_pct_fora_range
  check (comissao_pct_fora >= 0 and comissao_pct_fora <= 100);

comment on column public.cupom.responsavel_user_id is
  'Dono do cupom quando é um usuário da plataforma (opcional).';
comment on column public.cupom.responsavel_nome is
  'Nome livre do responsável quando ele não tem conta (opcional).';
comment on column public.cupom.comissao_pct_ipatinga is
  'Percentual de comissão sobre vendas de alunos da unidade de Ipatinga.';
comment on column public.cupom.comissao_pct_fora is
  'Percentual de comissão sobre vendas de alunos de qualquer outra unidade.';

create index if not exists idx_cupom_responsavel_user
  on public.cupom (responsavel_user_id) where responsavel_user_id is not null;

-- ─── 2. Helper: aluno é da unidade de Ipatinga? ─────────────────────────────
-- A unidade fica em `profiles.faculdade_unidade` no formato slug ('ipatinga_mg').
create or replace function public.aluno_e_ipatinga(p_unidade text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_unidade, '')) like 'ipatinga%';
$$;

revoke all on function public.aluno_e_ipatinga(text) from public;
grant execute on function public.aluno_e_ipatinga(text) to authenticated, service_role;

-- Rótulo legível da unidade para relatório/PDF: 'ipatinga_mg' → 'Ipatinga (MG)'.
create or replace function public.unidade_label(p_unidade text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(btrim(p_unidade), '') = '' then null
    when p_unidade ~ '_[a-z]{2}$' then
      initcap(replace(left(p_unidade, length(p_unidade) - 3), '_', ' '))
      || ' (' || upper(right(p_unidade, 2)) || ')'
    else initcap(replace(p_unidade, '_', ' '))
  end;
$$;

revoke all on function public.unidade_label(text) from public;
grant execute on function public.unidade_label(text) to authenticated, service_role;

-- ─── 3. Listagem admin de cupons (com uso e receita acumulados) ─────────────
create or replace function public.admin_listar_cupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'codigo'), '[]'::jsonb)
    into v_out
  from (
    select jsonb_build_object(
      'id', c.id,
      'codigo', c.codigo,
      'descricao', c.descricao,
      'tipo', c.tipo,
      'valor', c.valor,
      'plano_id', c.plano_id,
      'plano_nome', pl.nome,
      'plano_slug', pl.slug,
      'ativo', c.ativo,
      'expira_em', c.expira_em,
      'max_usos', c.max_usos,
      'max_por_usuario', c.max_por_usuario,
      'responsavel_user_id', c.responsavel_user_id,
      'responsavel_user_nome', pr.nome_completo,
      'responsavel_user_email', pr.email,
      'responsavel_nome', c.responsavel_nome,
      'comissao_ativa', c.comissao_ativa,
      'comissao_pct_ipatinga', c.comissao_pct_ipatinga,
      'comissao_pct_fora', c.comissao_pct_fora,
      'comissao_planos_avancado', c.comissao_planos_avancado,
      'comissao_planos_essencial', c.comissao_planos_essencial,
      'criado_em', c.criado_em,
      'usos', coalesce(u.usos, 0),
      'receita_centavos', coalesce(u.receita, 0),
      'expirado', c.expira_em is not null and c.expira_em < now()
    ) as linha
    from public.cupom c
    left join public.plano pl on pl.id = c.plano_id
    left join public.profiles pr on pr.id = c.responsavel_user_id
    left join lateral (
      select count(*)::int as usos, coalesce(sum(pg.valor_centavos), 0)::int as receita
      from public.pagamento pg
      join public.pagamento_intencao pi on pi.id = pg.intencao_id
      where pi.cupom_id = c.id and pg.status = 'approved'
    ) u on true
  ) s;

  return v_out;
end;
$$;

revoke all on function public.admin_listar_cupons() from public;
grant execute on function public.admin_listar_cupons() to authenticated;

-- ─── 4. Upsert de cupom ─────────────────────────────────────────────────────
-- p_id null => cria. Código sempre normalizado para maiúsculas sem espaços.
create or replace function public.admin_salvar_cupom(
  p_id uuid,
  p_codigo text,
  p_descricao text,
  p_tipo text,
  p_valor integer,
  p_plano_id uuid,
  p_ativo boolean,
  p_expira_em timestamptz,
  p_max_usos integer,
  p_max_por_usuario integer,
  p_responsavel_user_id uuid,
  p_responsavel_nome text,
  p_comissao_ativa boolean,
  p_comissao_pct_ipatinga numeric,
  p_comissao_pct_fora numeric,
  p_comissao_planos_avancado boolean,
  p_comissao_planos_essencial boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  if v_codigo = '' then
    raise exception 'codigo_obrigatorio' using errcode = 'P0001';
  end if;
  if p_tipo not in ('percentual', 'fixo') then
    raise exception 'tipo_invalido' using errcode = 'P0001';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'valor_invalido' using errcode = 'P0001';
  end if;
  if p_tipo = 'percentual' and p_valor > 100 then
    raise exception 'percentual_acima_de_100' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cupom c
    where c.codigo = v_codigo and (p_id is null or c.id <> p_id)
  ) then
    raise exception 'codigo_duplicado' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.cupom (
      codigo, descricao, tipo, valor, plano_id, ativo, expira_em,
      max_usos, max_por_usuario, responsavel_user_id, responsavel_nome,
      comissao_ativa, comissao_pct_ipatinga, comissao_pct_fora,
      comissao_planos_avancado, comissao_planos_essencial
    ) values (
      v_codigo, nullif(btrim(coalesce(p_descricao, '')), ''), p_tipo, p_valor,
      p_plano_id, coalesce(p_ativo, true), p_expira_em,
      p_max_usos, p_max_por_usuario, p_responsavel_user_id,
      nullif(btrim(coalesce(p_responsavel_nome, '')), ''),
      coalesce(p_comissao_ativa, false),
      coalesce(p_comissao_pct_ipatinga, 0), coalesce(p_comissao_pct_fora, 0),
      coalesce(p_comissao_planos_avancado, true),
      coalesce(p_comissao_planos_essencial, true)
    )
    returning id into v_id;
  else
    update public.cupom set
      codigo = v_codigo,
      descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
      tipo = p_tipo,
      valor = p_valor,
      plano_id = p_plano_id,
      ativo = coalesce(p_ativo, true),
      expira_em = p_expira_em,
      max_usos = p_max_usos,
      max_por_usuario = p_max_por_usuario,
      responsavel_user_id = p_responsavel_user_id,
      responsavel_nome = nullif(btrim(coalesce(p_responsavel_nome, '')), ''),
      comissao_ativa = coalesce(p_comissao_ativa, false),
      comissao_pct_ipatinga = coalesce(p_comissao_pct_ipatinga, 0),
      comissao_pct_fora = coalesce(p_comissao_pct_fora, 0),
      comissao_planos_avancado = coalesce(p_comissao_planos_avancado, true),
      comissao_planos_essencial = coalesce(p_comissao_planos_essencial, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'cupom_nao_encontrado' using errcode = 'P0001';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_salvar_cupom(
  uuid, text, text, text, integer, uuid, boolean, timestamptz, integer, integer,
  uuid, text, boolean, numeric, numeric, boolean, boolean
) from public;
grant execute on function public.admin_salvar_cupom(
  uuid, text, text, text, integer, uuid, boolean, timestamptz, integer, integer,
  uuid, text, boolean, numeric, numeric, boolean, boolean
) to authenticated;

-- ─── 5. Exclusão de cupom ───────────────────────────────────────────────────
-- Cupom já usado em checkout NÃO é excluído (quebraria o histórico da venda);
-- nesse caso o admin desativa. A RPC devolve o motivo para a UI orientar.
create or replace function public.admin_excluir_cupom(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usos int;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  select count(*)::int into v_usos
  from public.pagamento_intencao pi where pi.cupom_id = p_id;

  if v_usos > 0 then
    update public.cupom set ativo = false where id = p_id;
    return jsonb_build_object('excluido', false, 'desativado', true, 'usos', v_usos);
  end if;

  delete from public.cupom where id = p_id;
  return jsonb_build_object('excluido', true, 'desativado', false, 'usos', 0);
end;
$$;

revoke all on function public.admin_excluir_cupom(uuid) from public;
grant execute on function public.admin_excluir_cupom(uuid) to authenticated;

-- ─── 6. Busca de usuários para vincular como responsável ────────────────────
create or replace function public.admin_buscar_usuarios_cupom(p_busca text, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_termo text := btrim(coalesce(p_busca, ''));
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  if length(v_termo) < 2 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id,
      'nome_completo', pr.nome_completo,
      'email', pr.email,
      'faculdade_unidade', pr.faculdade_unidade
    )), '[]'::jsonb)
    into v_out
  from (
    select p.id, p.nome_completo, p.email, p.faculdade_unidade
    from public.profiles p
    where p.email ilike '%' || v_termo || '%'
       or coalesce(p.nome_completo, '') ilike '%' || v_termo || '%'
    order by p.nome_completo nulls last, p.email
    limit least(coalesce(p_limit, 10), 30)
  ) pr;

  return v_out;
end;
$$;

revoke all on function public.admin_buscar_usuarios_cupom(text, integer) from public;
grant execute on function public.admin_buscar_usuarios_cupom(text, integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Comissões por COMPETÊNCIA MENSAL (substitui o relatório sob demanda)
--
-- O relatório por período livre não deixava rastro: não havia como saber o que
-- já tinha sido apurado, fechado ou pago. Agora cada cupom tem uma linha por
-- mês, calculada automaticamente a partir das vendas aprovadas, com ciclo de
-- vida explícito:
--
--   aberta  → mês sem registro em `comissao_competencia` (valor recalculado
--             a cada leitura; o mês corrente vive aqui)
--   fechada → valores CONGELADOS no fechamento (snapshot), aguardando repasse
--   paga    → repasse efetuado, com data e observação
--
-- Fechar congela o snapshot para que uma venda ou estorno posterior não mude
-- silenciosamente um valor já acertado com o responsável. Quando o cálculo ao
-- vivo divergir do snapshot, a linha sinaliza a divergência em vez de escolher
-- um dos dois.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Cálculo por venda (fonte única das três RPCs de comissão) ──────────────
-- Mesma junção e mesma base da skill `prestacao-contas-cupom`: pagamento →
-- pagamento_intencao → cupom, recorte por `pagamento.criado_em`, só `approved`,
-- base = valor pago pelo aluno (já com o desconto do cupom).
create or replace function public.comissao_vendas_calculadas(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_cupom_id uuid default null
)
returns table (
  pagamento_id uuid,
  data timestamptz,
  competencia date,
  cupom_id uuid,
  codigo text,
  responsavel text,
  responsavel_email text,
  aluno_nome text,
  aluno_email text,
  unidade text,
  unidade_label text,
  unidade_indefinida boolean,
  e_ipatinga boolean,
  plano_nome text,
  tier text,
  bruto_centavos integer,
  liquido_centavos integer,
  desconto_centavos integer,
  pct numeric,
  comissao_centavos integer,
  elegivel boolean,
  motivo text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg.id,
    pg.criado_em,
    date_trunc('month', pg.criado_em)::date,
    c.id,
    c.codigo,
    coalesce(c.responsavel_nome, resp.nome_completo, resp.email),
    resp.email,
    al.nome_completo,
    al.email,
    al.faculdade_unidade,
    public.unidade_label(al.faculdade_unidade),
    coalesce(btrim(al.faculdade_unidade), '') = '',
    public.aluno_e_ipatinga(al.faculdade_unidade),
    pl.nome,
    pl.tier,
    coalesce(pg.valor_centavos, 0),
    coalesce(pg.liquido_centavos, 0),
    coalesce(pi.desconto_centavos, 0),
    case when elegivel.ok then pct.valor else 0 end,
    case when elegivel.ok
         then round(coalesce(pg.valor_centavos, 0) * pct.valor / 100.0)::int
         else 0 end,
    elegivel.ok,
    case
      when not c.comissao_ativa then 'comissao_desativada'
      when not elegivel.ok then 'tier_nao_elegivel'
      when pct.valor = 0 then 'percentual_zero'
      when coalesce(btrim(al.faculdade_unidade), '') = '' then 'unidade_nao_informada'
      else null
    end
  from public.pagamento pg
  join public.pagamento_intencao pi on pi.id = pg.intencao_id
  join public.cupom c on c.id = pi.cupom_id
  left join public.profiles al on al.id = pg.user_id
  left join public.profiles resp on resp.id = c.responsavel_user_id
  left join public.assinatura asn on asn.id = pg.assinatura_id
  left join public.plano pl on pl.id = coalesce(pi.plano_id, asn.plano_id)
  cross join lateral (
    select case when public.aluno_e_ipatinga(al.faculdade_unidade)
                then c.comissao_pct_ipatinga else c.comissao_pct_fora end as valor
  ) pct
  cross join lateral (
    select c.comissao_ativa and case coalesce(pl.tier, 'avancado')
             when 'essencial' then c.comissao_planos_essencial
             else c.comissao_planos_avancado
           end as ok
  ) elegivel
  where pg.status = 'approved'
    and (p_inicio is null or pg.criado_em >= p_inicio)
    and (p_fim is null or pg.criado_em <= p_fim)
    and (p_cupom_id is null or c.id = p_cupom_id);
$$;

-- Função interna: as RPCs `admin_*` (security definer) a chamam pelo owner.
revoke all on function public.comissao_vendas_calculadas(timestamptz, timestamptz, uuid) from public;
grant execute on function public.comissao_vendas_calculadas(timestamptz, timestamptz, uuid) to service_role;

-- ─── Fechamento mensal ──────────────────────────────────────────────────────
-- A linha só existe quando o mês foi fechado; ausência de linha = mês aberto.
create table if not exists public.comissao_competencia (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cupom_id uuid not null references public.cupom(id) on delete cascade,
  -- Sempre o primeiro dia do mês de competência.
  competencia date not null,
  status text not null default 'fechada' check (status in ('fechada', 'paga')),
  -- Snapshot congelado no fechamento.
  vendas integer not null default 0,
  bruto_centavos integer not null default 0,
  liquido_centavos integer not null default 0,
  desconto_centavos integer not null default 0,
  comissao_centavos integer not null default 0,
  fechada_em timestamptz not null default now(),
  fechada_por uuid references public.profiles(id) on delete set null,
  paga_em timestamptz,
  pago_por uuid references public.profiles(id) on delete set null,
  observacao text,
  constraint comissao_competencia_unica unique (cupom_id, competencia),
  constraint comissao_competencia_dia_1 check (competencia = date_trunc('month', competencia)::date),
  constraint comissao_competencia_paga_tem_data
    check (status <> 'paga' or paga_em is not null)
);

comment on table public.comissao_competencia is
  'Fechamento mensal de comissão por cupom. Ausência de linha = competência aberta; a linha guarda o snapshot congelado no fechamento.';

alter table public.comissao_competencia enable row level security;

-- Leitura só para admin; escrita exclusivamente pelas RPCs (security definer).
drop policy if exists comissao_competencia_select_admin on public.comissao_competencia;
create policy comissao_competencia_select_admin on public.comissao_competencia
  for select to authenticated
  using (public.is_admin());

drop trigger if exists comissao_competencia_set_atualizado_em on public.comissao_competencia;
create trigger comissao_competencia_set_atualizado_em
  before update on public.comissao_competencia
  for each row execute function public.update_atualizado_em();

grant select on public.comissao_competencia to authenticated;
grant all on public.comissao_competencia to service_role;

create index if not exists idx_comissao_competencia_cupom
  on public.comissao_competencia (cupom_id, competencia desc);

-- ─── Listagem das competências (aberta/fechada/paga) ────────────────────────
-- Gera automaticamente um mês por cupom para cada mês com venda, e mantém os
-- meses já fechados mesmo que as vendas tenham sido estornadas depois.
create or replace function public.admin_comissoes_competencias(
  p_cupom_id uuid default null,
  p_status text default null,
  p_ano integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
  v_mes_atual date := date_trunc('month', now())::date;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  with vendas as (
    select * from public.comissao_vendas_calculadas(null, null, p_cupom_id)
  ),
  apurado as (
    select v.cupom_id, v.competencia,
           count(*)::int as vendas,
           sum(v.bruto_centavos)::int as bruto_centavos,
           sum(v.liquido_centavos)::int as liquido_centavos,
           sum(v.desconto_centavos)::int as desconto_centavos,
           sum(v.comissao_centavos)::int as comissao_centavos,
           count(*) filter (where v.e_ipatinga)::int as vendas_ipatinga,
           count(*) filter (where not v.e_ipatinga)::int as vendas_fora,
           count(*) filter (where v.unidade_indefinida)::int as unidades_indefinidas
    from vendas v
    group by v.cupom_id, v.competencia
  ),
  -- União dos meses com venda e dos meses já fechados (podem não coincidir).
  meses as (
    select cupom_id, competencia from apurado
    union
    select cc.cupom_id, cc.competencia
    from public.comissao_competencia cc
    where p_cupom_id is null or cc.cupom_id = p_cupom_id
  )
  select coalesce(jsonb_agg(linha order by (linha->>'competencia') desc, linha->>'codigo'), '[]'::jsonb)
    into v_out
  from (
    select jsonb_build_object(
      'cupom_id', m.cupom_id,
      'codigo', c.codigo,
      'responsavel', coalesce(c.responsavel_nome, pr.nome_completo, pr.email),
      'responsavel_email', pr.email,
      'competencia', m.competencia,
      'em_andamento', m.competencia = v_mes_atual,
      'status', coalesce(cc.status, 'aberta'),
      -- Apurado ao vivo (o que as vendas dizem agora).
      'vendas', coalesce(a.vendas, 0),
      'bruto_centavos', coalesce(a.bruto_centavos, 0),
      'liquido_centavos', coalesce(a.liquido_centavos, 0),
      'desconto_centavos', coalesce(a.desconto_centavos, 0),
      'comissao_centavos', coalesce(a.comissao_centavos, 0),
      'vendas_ipatinga', coalesce(a.vendas_ipatinga, 0),
      'vendas_fora', coalesce(a.vendas_fora, 0),
      'unidades_indefinidas', coalesce(a.unidades_indefinidas, 0),
      -- Snapshot do fechamento (null quando aberta).
      'fechado_vendas', cc.vendas,
      'fechado_bruto_centavos', cc.bruto_centavos,
      'fechado_comissao_centavos', cc.comissao_centavos,
      'fechada_em', cc.fechada_em,
      'paga_em', cc.paga_em,
      'observacao', cc.observacao,
      -- Venda ou estorno depois do fechamento: mostra, não corrige sozinho.
      'divergente', cc.id is not null
        and coalesce(a.comissao_centavos, 0) <> cc.comissao_centavos,
      'comissao_ativa', c.comissao_ativa,
      'comissao_pct_ipatinga', c.comissao_pct_ipatinga,
      'comissao_pct_fora', c.comissao_pct_fora
    ) as linha
    from meses m
    join public.cupom c on c.id = m.cupom_id
    left join public.profiles pr on pr.id = c.responsavel_user_id
    left join apurado a on a.cupom_id = m.cupom_id and a.competencia = m.competencia
    left join public.comissao_competencia cc
      on cc.cupom_id = m.cupom_id and cc.competencia = m.competencia
    where (p_ano is null or extract(year from m.competencia) = p_ano)
      and (p_status is null or coalesce(cc.status, 'aberta') = p_status)
  ) s;

  return v_out;
end;
$$;

revoke all on function public.admin_comissoes_competencias(uuid, text, integer) from public;
grant execute on function public.admin_comissoes_competencias(uuid, text, integer) to authenticated;

-- ─── Detalhe de uma competência (expandir na tela e emitir o PDF) ───────────
create or replace function public.admin_comissao_detalhe(
  p_cupom_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_competencia)::date;
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  with vendas as (
    select * from public.comissao_vendas_calculadas(
      v_mes::timestamptz,
      (v_mes + interval '1 month' - interval '1 microsecond')::timestamptz,
      p_cupom_id
    )
  )
  select jsonb_build_object(
    'cupom_id', c.id,
    'codigo', c.codigo,
    'descricao', c.descricao,
    'cupom_tipo', c.tipo,
    'cupom_valor', c.valor,
    'responsavel', coalesce(c.responsavel_nome, pr.nome_completo, pr.email),
    'responsavel_email', pr.email,
    'comissao_ativa', c.comissao_ativa,
    'comissao_pct_ipatinga', c.comissao_pct_ipatinga,
    'comissao_pct_fora', c.comissao_pct_fora,
    'comissao_planos_avancado', c.comissao_planos_avancado,
    'comissao_planos_essencial', c.comissao_planos_essencial,
    'competencia', v_mes,
    'status', coalesce(cc.status, 'aberta'),
    'em_andamento', v_mes = date_trunc('month', now())::date,
    'fechada_em', cc.fechada_em,
    'paga_em', cc.paga_em,
    'observacao', cc.observacao,
    -- Snapshot do fechamento: é ELE que vale no documento de repasse de uma
    -- competência fechada, não o recálculo ao vivo.
    'fechado_vendas', cc.vendas,
    'fechado_bruto_centavos', cc.bruto_centavos,
    'fechado_comissao_centavos', cc.comissao_centavos,
    'totais', (
      select jsonb_build_object(
        'vendas', count(*)::int,
        'bruto_centavos', coalesce(sum(v.bruto_centavos), 0)::int,
        'liquido_centavos', coalesce(sum(v.liquido_centavos), 0)::int,
        'desconto_centavos', coalesce(sum(v.desconto_centavos), 0)::int,
        'comissao_centavos', coalesce(sum(v.comissao_centavos), 0)::int,
        'unidades_indefinidas', count(*) filter (where v.unidade_indefinida)::int
      ) from vendas v
    ),
    'vendas', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.data), '[]'::jsonb)
      from (
        select v.pagamento_id, v.data, v.aluno_nome, v.aluno_email, v.unidade,
               v.unidade_label, v.unidade_indefinida, v.e_ipatinga, v.plano_nome,
               v.tier, v.bruto_centavos, v.liquido_centavos, v.desconto_centavos,
               v.pct, v.comissao_centavos, v.elegivel, v.motivo
        from vendas v
      ) x
    )
  ) into v_out
  from public.cupom c
  left join public.profiles pr on pr.id = c.responsavel_user_id
  left join public.comissao_competencia cc
    on cc.cupom_id = c.id and cc.competencia = v_mes
  where c.id = p_cupom_id;

  if v_out is null then
    raise exception 'cupom_nao_encontrado' using errcode = 'P0001';
  end if;

  return v_out;
end;
$$;

revoke all on function public.admin_comissao_detalhe(uuid, date) from public;
grant execute on function public.admin_comissao_detalhe(uuid, date) to authenticated;

-- ─── Fechar / pagar / reabrir ───────────────────────────────────────────────
-- Fechar recalcula e congela o snapshot. Rodar de novo num mês já fechado
-- atualiza o snapshot (é como se corrige uma divergência), preservando o
-- status de pagamento.
create or replace function public.admin_fechar_comissao(
  p_cupom_id uuid,
  p_competencia date,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_competencia)::date;
  v_t record;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.cupom where id = p_cupom_id) then
    raise exception 'cupom_nao_encontrado' using errcode = 'P0001';
  end if;

  select count(*)::int as vendas,
         coalesce(sum(v.bruto_centavos), 0)::int as bruto,
         coalesce(sum(v.liquido_centavos), 0)::int as liquido,
         coalesce(sum(v.desconto_centavos), 0)::int as desconto,
         coalesce(sum(v.comissao_centavos), 0)::int as comissao
    into v_t
  from public.comissao_vendas_calculadas(
    v_mes::timestamptz,
    (v_mes + interval '1 month' - interval '1 microsecond')::timestamptz,
    p_cupom_id
  ) v;

  insert into public.comissao_competencia (
    cupom_id, competencia, status, vendas, bruto_centavos, liquido_centavos,
    desconto_centavos, comissao_centavos, fechada_em, fechada_por, observacao
  ) values (
    p_cupom_id, v_mes, 'fechada', v_t.vendas, v_t.bruto, v_t.liquido,
    v_t.desconto, v_t.comissao, now(), auth.uid(),
    nullif(btrim(coalesce(p_observacao, '')), '')
  )
  on conflict (cupom_id, competencia) do update set
    vendas = excluded.vendas,
    bruto_centavos = excluded.bruto_centavos,
    liquido_centavos = excluded.liquido_centavos,
    desconto_centavos = excluded.desconto_centavos,
    comissao_centavos = excluded.comissao_centavos,
    fechada_em = now(),
    fechada_por = auth.uid(),
    observacao = coalesce(excluded.observacao, public.comissao_competencia.observacao);

  return jsonb_build_object(
    'competencia', v_mes,
    'vendas', v_t.vendas,
    'comissao_centavos', v_t.comissao
  );
end;
$$;

revoke all on function public.admin_fechar_comissao(uuid, date, text) from public;
grant execute on function public.admin_fechar_comissao(uuid, date, text) to authenticated;

-- Marcar como paga fecha a competência antes, se ainda estiver aberta: não
-- existe repasse pago sem valor congelado.
create or replace function public.admin_marcar_comissao_paga(
  p_cupom_id uuid,
  p_competencia date,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_competencia)::date;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.comissao_competencia
    where cupom_id = p_cupom_id and competencia = v_mes
  ) then
    perform public.admin_fechar_comissao(p_cupom_id, v_mes, p_observacao);
  end if;

  update public.comissao_competencia set
    status = 'paga',
    paga_em = now(),
    pago_por = auth.uid(),
    observacao = coalesce(nullif(btrim(coalesce(p_observacao, '')), ''), observacao)
  where cupom_id = p_cupom_id and competencia = v_mes;

  return jsonb_build_object('competencia', v_mes, 'status', 'paga');
end;
$$;

revoke all on function public.admin_marcar_comissao_paga(uuid, date, text) from public;
grant execute on function public.admin_marcar_comissao_paga(uuid, date, text) to authenticated;

-- Reabrir descarta o snapshot e a marca de pagamento: o mês volta a ser
-- recalculado ao vivo.
create or replace function public.admin_reabrir_comissao(
  p_cupom_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_competencia)::date;
  v_apagadas integer;
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  delete from public.comissao_competencia
  where cupom_id = p_cupom_id and competencia = v_mes;
  get diagnostics v_apagadas = row_count;

  return jsonb_build_object('competencia', v_mes, 'reaberta', v_apagadas > 0);
end;
$$;

revoke all on function public.admin_reabrir_comissao(uuid, date) from public;
grant execute on function public.admin_reabrir_comissao(uuid, date) to authenticated;
