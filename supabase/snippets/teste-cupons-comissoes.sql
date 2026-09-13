-- Teste das RPCs do módulo de cupons no papel de admin (banco local).
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

\echo '=== admin_listar_cupons (resumo) ==='
select c->>'codigo' as codigo,
       c->>'responsavel_user_email' as resp_email,
       c->>'responsavel_nome' as resp_nome,
       c->>'comissao_ativa' as com_ativa,
       c->>'comissao_pct_ipatinga' as pct_ipa,
       c->>'comissao_pct_fora' as pct_fora,
       c->>'usos' as usos,
       c->>'receita_centavos' as receita
from jsonb_array_elements(public.admin_listar_cupons()) c;

\echo '=== admin_relatorio_comissoes (totais e por cupom) ==='
with r as (
  select public.admin_relatorio_comissoes(now() - interval '60 days', now(), null) as j
)
select j->'totais' as totais from r;

with r as (
  select public.admin_relatorio_comissoes(now() - interval '60 days', now(), null) as j
)
select x->>'codigo' as cupom,
       x->>'responsavel' as responsavel,
       x->>'vendas' as vendas,
       x->>'vendas_ipatinga' as ipa,
       x->>'vendas_fora' as fora,
       x->>'unidades_indefinidas' as sem_unidade,
       (x->>'bruto_centavos')::int / 100.0 as bruto,
       (x->>'comissao_centavos')::int / 100.0 as comissao
from r, jsonb_array_elements(r.j->'por_cupom') x;

\echo '=== vendas detalhadas ==='
with r as (
  select public.admin_relatorio_comissoes(now() - interval '60 days', now(), null) as j
)
select to_char((x->>'data')::timestamptz, 'DD/MM/YYYY') as data,
       x->>'codigo' as cupom,
       x->>'aluno_nome' as aluno,
       x->>'unidade' as unidade,
       x->>'plano_nome' as plano,
       x->>'tier' as tier,
       (x->>'bruto_centavos')::int / 100.0 as pago,
       x->>'pct' as pct,
       (x->>'comissao_centavos')::int / 100.0 as comissao,
       x->>'motivo' as motivo
from r, jsonb_array_elements(r.j->'vendas') x
order by 1;

\echo '=== busca de usuarios ==='
select public.admin_buscar_usuarios_cupom('yas');

\echo '=== salvar cupom novo ==='
select public.admin_salvar_cupom(
  null, 'teste99', 'Cupom de teste', 'percentual', 25, null, true, null,
  100, 1, null, 'Fulano Teste', true, 10, 15, true, false
) is not null as criou;
select codigo, descricao, responsavel_nome, comissao_pct_ipatinga, comissao_pct_fora,
       comissao_planos_avancado, comissao_planos_essencial
from public.cupom where codigo = 'TESTE99';

\echo '=== codigo duplicado deve falhar ==='
do $$
begin
  perform public.admin_salvar_cupom(null, 'teste99', null, 'percentual', 10, null,
    true, null, null, null, null, null, false, 0, 0, true, true);
  raise notice 'FALHOU: duplicata aceita';
exception when others then
  raise notice 'ok, recusou duplicata: %', sqlerrm;
end $$;

\echo '=== exclusao (cupom sem uso: apaga) ==='
select public.admin_excluir_cupom((select id from public.cupom where codigo = 'TESTE99'));

\echo '=== exclusao (cupom com uso: desativa) ==='
select public.admin_excluir_cupom((select id from public.cupom where codigo = 'YAS20'));
select codigo, ativo from public.cupom where codigo = 'YAS20';

rollback;
