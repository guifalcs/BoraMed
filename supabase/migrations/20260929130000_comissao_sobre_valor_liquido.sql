-- ════════════════════════════════════════════════════════════════════════════
-- Comissão passa a incidir sobre o valor LÍQUIDO, não sobre o bruto pago
--
-- Até aqui `comissao_vendas_calculadas` calculava a comissão sobre
-- `pagamento.valor_centavos` (o que o aluno pagou, já com o desconto do cupom,
-- mas ANTES da taxa do Mercado Pago). O responsável recebia percentual de um
-- dinheiro que nunca chegou ao caixa da plataforma.
--
-- Nova base: `pagamento.liquido_centavos` (net_received_amount do MP: desconto
-- do cupom e taxa do gateway já descontados). Mesmo fallback do financeiro
-- (`COALESCE(liquido_centavos, valor_centavos)`) para pagamento aprovado sem
-- líquido informado.
--
-- Contrato preservado (mesmas colunas de retorno): `bruto_centavos` segue sendo
-- o valor pago pelo aluno, e `liquido_centavos` agora é exatamente a base da
-- comissão (com o fallback aplicado). As RPCs admin_* que consomem esta função
-- não mudam.
--
-- Competências JÁ FECHADAS ou PAGAS mantêm o snapshot congelado (regra de
-- negócio: o que foi acertado não muda sozinho). Enquanto o snapshot diferir do
-- cálculo novo a linha aparece como "divergente"; refechar a competência
-- (admin_fechar_comissao) atualiza o snapshot para a nova base.
-- ════════════════════════════════════════════════════════════════════════════

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
    coalesce(pg.liquido_centavos, pg.valor_centavos, 0),
    coalesce(pi.desconto_centavos, 0),
    case when elegivel.ok then pct.valor else 0 end,
    case when elegivel.ok
         then round(coalesce(pg.liquido_centavos, pg.valor_centavos, 0) * pct.valor / 100.0)::int
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

-- create or replace preserva grants; reafirma por segurança (função interna).
revoke all on function public.comissao_vendas_calculadas(timestamptz, timestamptz, uuid) from public;
grant execute on function public.comissao_vendas_calculadas(timestamptz, timestamptz, uuid) to service_role;
