-- Teste do ciclo de vida das competências de comissão (banco local).
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

\echo '=== fechar agosto do YAS20 ==='
select public.admin_fechar_comissao(
  (select id from public.cupom where codigo = 'YAS20'), '2026-08-01', 'Fechamento de agosto'
);

\echo '=== status depois do fechamento ==='
select x->>'codigo' as cupom, x->>'competencia' as mes, x->>'status' as status,
       (x->>'fechado_comissao_centavos')::int / 100.0 as congelado,
       (x->>'comissao_centavos')::int / 100.0 as ao_vivo,
       x->>'divergente' as divergente
from jsonb_array_elements(public.admin_comissoes_competencias(null, null, null)) x
where x->>'codigo' = 'YAS20';

\echo '=== marcar como paga ==='
select public.admin_marcar_comissao_paga(
  (select id from public.cupom where codigo = 'YAS20'), '2026-08-01', 'Pix enviado'
);
select status, paga_em is not null as tem_data_pagamento, observacao,
       comissao_centavos / 100.0 as congelado
from public.comissao_competencia;

\echo '=== filtro por status (paga) ==='
select jsonb_array_length(public.admin_comissoes_competencias(null, 'paga', null)) as pagas,
       jsonb_array_length(public.admin_comissoes_competencias(null, 'aberta', null)) as abertas;

\echo '=== detalhe da competencia (base do PDF) ==='
select (public.admin_comissao_detalhe(
  (select id from public.cupom where codigo = 'YAS20'), '2026-08-01'
))->'totais' as totais;
select jsonb_array_length((public.admin_comissao_detalhe(
  (select id from public.cupom where codigo = 'YAS20'), '2026-08-01'
))->'vendas') as qtd_vendas;

\echo '=== divergencia: venda nova depois do fechamento ==='
-- Simula um pagamento aprovado entrando em agosto após o fechamento.
-- O insert direto precisa sair do papel `authenticated` (RLS da tabela).
reset role;
insert into public.pagamento (id, user_id, intencao_id, valor_centavos, moeda, status,
                              metodo_pagamento, processado_em, liquido_centavos, criado_em)
select gen_random_uuid(), pi.user_id, pi.id, 10000, 'BRL', 'approved', 'pix',
       '2026-08-25', 9500, '2026-08-25'
from public.pagamento_intencao pi
join public.cupom c on c.id = pi.cupom_id
where c.codigo = 'YAS20' limit 1;
set local role authenticated;

select x->>'status' as status, x->>'divergente' as divergente,
       (x->>'fechado_comissao_centavos')::int / 100.0 as congelado,
       (x->>'comissao_centavos')::int / 100.0 as ao_vivo
from jsonb_array_elements(public.admin_comissoes_competencias(null, null, null)) x
where x->>'codigo' = 'YAS20' and x->>'competencia' = '2026-08-01';

\echo '=== reabrir ==='
select public.admin_reabrir_comissao(
  (select id from public.cupom where codigo = 'YAS20'), '2026-08-01'
);
select count(*) as registros_restantes from public.comissao_competencia;

rollback;
