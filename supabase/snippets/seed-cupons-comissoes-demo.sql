-- ════════════════════════════════════════════════════════════════════════════
-- SEED DE DEMONSTRAÇÃO — módulo admin de Cupons + Comissões (SOMENTE LOCAL)
--
-- Cria responsáveis, alunos compradores de unidades diferentes e um histórico
-- de vendas aprovadas com cupom, para validar o CRUD e o relatório de comissões
-- com números conferíveis à mão. Idempotente: pode rodar várias vezes.
--
-- NUNCA rodar contra o ref de produção.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Usuários (auth.users → trigger cria o profile) ─────────────────────────
-- Senha de todos: Teste123!
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, crypt('Teste123!', gen_salt('bf')), now(),
  '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', u.nome),
  now() - interval '120 days', now(), false, false
from (values
  -- Responsáveis por cupom (embaixadores)
  ('c0000000-0000-4000-a000-000000000001'::uuid, 'yasmin@boramed.com',   'Yasmin Ribeiro'),
  ('c0000000-0000-4000-a000-000000000002'::uuid, 'izadora@boramed.com',  'Izadora Campos'),
  -- Alunos compradores
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'bruna@aluno.com',      'Bruna Martins'),
  ('a0000000-0000-4000-a000-000000000002'::uuid, 'caio@aluno.com',       'Caio Nogueira'),
  ('a0000000-0000-4000-a000-000000000003'::uuid, 'duda@aluno.com',       'Eduarda Lopes'),
  ('a0000000-0000-4000-a000-000000000004'::uuid, 'felipe@aluno.com',     'Felipe Andrade'),
  ('a0000000-0000-4000-a000-000000000005'::uuid, 'gabi@aluno.com',       'Gabriela Souza'),
  ('a0000000-0000-4000-a000-000000000006'::uuid, 'heitor@aluno.com',     'HeitorVasques'),
  ('a0000000-0000-4000-a000-000000000007'::uuid, 'isadora@aluno.com',    'Isadora Prado'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, 'joao@aluno.com',       'João Pedro Reis')
) as u(id, email, nome)
on conflict (id) do nothing;

-- Unidade de cada perfil: define qual percentual da regra é aplicado.
-- João Pedro fica SEM unidade de propósito (caso "unidade não informada").
update public.profiles p set
  nome_completo = v.nome,
  faculdade_unidade = v.unidade
from (values
  ('c0000000-0000-4000-a000-000000000001'::uuid, 'Yasmin Ribeiro',  'ipatinga_mg'),
  ('c0000000-0000-4000-a000-000000000002'::uuid, 'Izadora Campos',  'ipatinga_mg'),
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'Bruna Martins',   'ipatinga_mg'),
  ('a0000000-0000-4000-a000-000000000002'::uuid, 'Caio Nogueira',   'ipatinga_mg'),
  ('a0000000-0000-4000-a000-000000000003'::uuid, 'Eduarda Lopes',   'ipatinga_mg'),
  ('a0000000-0000-4000-a000-000000000004'::uuid, 'Felipe Andrade',  'palmas_to'),
  ('a0000000-0000-4000-a000-000000000005'::uuid, 'Gabriela Souza',  'contagem_mg'),
  ('a0000000-0000-4000-a000-000000000006'::uuid, 'Heitor Vasques',  'montes_claros_mg'),
  ('a0000000-0000-4000-a000-000000000007'::uuid, 'Isadora Prado',   'ipatinga_mg'),
  ('a0000000-0000-4000-a000-000000000008'::uuid, 'João Pedro Reis', null)
) as v(id, nome, unidade)
where p.id = v.id;

-- ─── Cupons com responsável e regra de comissão ─────────────────────────────
-- YAS20: embaixadora com conta; comissão maior para fora de Ipatinga (mais
-- difícil de vender) e restrita aos planos Avançados.
update public.cupom set
  descricao = 'Campanha Yasmin — 20% em qualquer plano',
  responsavel_user_id = 'c0000000-0000-4000-a000-000000000001',
  responsavel_nome = null,
  comissao_ativa = true,
  comissao_pct_ipatinga = 30,
  comissao_pct_fora = 40,
  comissao_planos_avancado = true,
  comissao_planos_essencial = false
where codigo = 'YAS20';

-- IZA15: mesma regra para as duas faixas e vale para os dois tiers.
update public.cupom set
  responsavel_user_id = 'c0000000-0000-4000-a000-000000000002',
  responsavel_nome = null,
  comissao_ativa = true,
  comissao_pct_ipatinga = 25,
  comissao_pct_fora = 25,
  comissao_planos_avancado = true,
  comissao_planos_essencial = true
where codigo = 'IZA15';

-- ARTHUR10: responsável sem conta na plataforma (só o nome).
insert into public.cupom (
  codigo, descricao, tipo, valor, plano_id, ativo, expira_em,
  max_usos, max_por_usuario, responsavel_nome,
  comissao_ativa, comissao_pct_ipatinga, comissao_pct_fora,
  comissao_planos_avancado, comissao_planos_essencial
) values (
  'ARTHUR10', 'Indicação Arthur — 10% em qualquer plano', 'percentual', 10,
  null, true, null, null, 1, 'Arthur Barata',
  true, 35, 20, true, true
) on conflict (codigo) do update set
  responsavel_nome = excluded.responsavel_nome,
  comissao_ativa = excluded.comissao_ativa,
  comissao_pct_ipatinga = excluded.comissao_pct_ipatinga,
  comissao_pct_fora = excluded.comissao_pct_fora;

-- CALOURO20 fica sem responsável e sem comissão: é campanha da casa.

-- ─── Vendas (intenção aprovada + pagamento approved) ────────────────────────
-- Cada linha: aluno, cupom, plano, dias atrás. O valor sai do preço do plano
-- menos o desconto do cupom, como no checkout real.
with vendas(user_id, cupom_codigo, plano_slug, dias_atras, metodo) as (
  values
    -- Meses antigos: dão histórico de competências já fechadas e pagas.
    ('a0000000-0000-4000-a000-000000000008'::uuid, 'YAS20',    'semestral',          100, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000006'::uuid, 'YAS20',    'mensal',              92, 'pix'),
    ('a0000000-0000-4000-a000-000000000003'::uuid, 'IZA15',    'semestral',           85, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000007'::uuid, 'YAS20',    'semestral',           70, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000005'::uuid, 'IZA15',    'essencial-semestral', 64, 'pix'),
    ('a0000000-0000-4000-a000-000000000001'::uuid, 'YAS20',    'semestral',           40, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000002'::uuid, 'YAS20',    'mensal',              33, 'pix'),
    ('a0000000-0000-4000-a000-000000000003'::uuid, 'YAS20',    'essencial-semestral', 27, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000004'::uuid, 'YAS20',    'semestral',           22, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000005'::uuid, 'YAS20',    'mensal',              15, 'pix'),
    ('a0000000-0000-4000-a000-000000000006'::uuid, 'IZA15',    'semestral',           19, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000007'::uuid, 'IZA15',    'essencial-mensal',    12, 'pix'),
    ('a0000000-0000-4000-a000-000000000008'::uuid, 'IZA15',    'semestral',            9, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000001'::uuid, 'ARTHUR10', 'essencial-mensal',     6, 'pix'),
    ('a0000000-0000-4000-a000-000000000004'::uuid, 'ARTHUR10', 'semestral',            3, 'credit_card'),
    ('a0000000-0000-4000-a000-000000000005'::uuid, 'CALOURO20','semestral',            2, 'credit_card')
),
calc as (
  select
    v.user_id,
    c.id as cupom_id,
    pl.id as plano_id,
    now() - make_interval(days => v.dias_atras) as quando,
    v.metodo,
    pl.preco_centavos,
    case when c.tipo = 'percentual'
         then round(pl.preco_centavos * c.valor / 100.0)::int
         else least(c.valor, pl.preco_centavos) end as desconto,
    -- UUID estável por (aluno, cupom, plano, dia): torna o seed idempotente
    -- sem colidir quando o mesmo aluno compra o mesmo plano em outro mês.
    md5(v.user_id::text || v.cupom_codigo || v.plano_slug || v.dias_atras::text)::uuid as intencao_id
  from vendas v
  join public.cupom c on c.codigo = v.cupom_codigo
  join public.plano pl on pl.slug = v.plano_slug
),
ins_intencao as (
  insert into public.pagamento_intencao (
    id, user_id, plano_id, tipo, idempotency_key, valor_centavos, metodo,
    parcelas, status, cupom_id, desconto_centavos, criado_em, atualizado_em
  )
  select
    c.intencao_id, c.user_id, c.plano_id, 'acesso_unico', c.intencao_id,
    c.preco_centavos - c.desconto, c.metodo, 1, 'aprovada',
    c.cupom_id, c.desconto, c.quando, c.quando
  from calc c
  on conflict (id) do nothing
  returning id
)
insert into public.pagamento (
  id, user_id, intencao_id, mp_payment_id, valor_centavos, moeda, status,
  metodo_pagamento, processado_em, liquido_centavos, criado_em, atualizado_em
)
select
  md5(c.intencao_id::text || 'pagamento')::uuid,
  c.user_id,
  c.intencao_id,
  'SEED-' || left(md5(c.intencao_id::text), 10),
  c.preco_centavos - c.desconto,
  'BRL',
  'approved',
  c.metodo,
  c.quando,
  -- Líquido ≈ bruto menos ~4,99% de taxa do Mercado Pago.
  round((c.preco_centavos - c.desconto) * 0.9501)::int,
  c.quando,
  c.quando
from calc c
on conflict (id) do nothing;


-- ─── Histórico de repasses (competências fechadas e pagas) ──────────────────
-- Meses encerrados entram já acertados; o mês corrente fica aberto de propósito.
insert into public.comissao_competencia (
  cupom_id, competencia, status, vendas, bruto_centavos, liquido_centavos,
  desconto_centavos, comissao_centavos, fechada_em, paga_em, observacao
)
select
  c.id,
  m.competencia,
  m.status,
  t.vendas, t.bruto, t.liquido, t.desconto, t.comissao,
  (m.competencia + interval '1 month' + interval '2 days'),
  case when m.status = 'paga'
       then (m.competencia + interval '1 month' + interval '3 days') end,
  m.observacao
from (values
  ('YAS20', date_trunc('month', now() - interval '3 months')::date, 'paga',    'Pix enviado no dia 3'),
  ('IZA15', date_trunc('month', now() - interval '3 months')::date, 'paga',    'Pix enviado no dia 3'),
  ('YAS20', date_trunc('month', now() - interval '2 months')::date, 'paga',    'Pago junto com a mensalidade'),
  ('IZA15', date_trunc('month', now() - interval '2 months')::date, 'fechada', 'Aguardando dados bancários'),
  ('YAS20', date_trunc('month', now() - interval '1 month')::date,  'fechada', null)
) as m(codigo, competencia, status, observacao)
join public.cupom c on c.codigo = m.codigo
cross join lateral (
  select count(*)::int as vendas,
         coalesce(sum(v.bruto_centavos), 0)::int as bruto,
         coalesce(sum(v.liquido_centavos), 0)::int as liquido,
         coalesce(sum(v.desconto_centavos), 0)::int as desconto,
         coalesce(sum(v.comissao_centavos), 0)::int as comissao
  from public.comissao_vendas_calculadas(
    m.competencia::timestamptz,
    (m.competencia + interval '1 month' - interval '1 microsecond')::timestamptz,
    c.id
  ) v
) t
where t.vendas > 0
on conflict (cupom_id, competencia) do nothing;

-- ─── Conferência ────────────────────────────────────────────────────────────
select c.codigo,
       coalesce(c.responsavel_nome, pr.nome_completo) as responsavel,
       c.comissao_pct_ipatinga as pct_ipa,
       c.comissao_pct_fora as pct_fora,
       count(pg.id) as vendas,
       sum(pg.valor_centavos) / 100.0 as bruto_reais
from public.cupom c
left join public.profiles pr on pr.id = c.responsavel_user_id
left join public.pagamento_intencao pi on pi.cupom_id = c.id
left join public.pagamento pg on pg.intencao_id = pi.id and pg.status = 'approved'
group by c.codigo, responsavel, c.comissao_pct_ipatinga, c.comissao_pct_fora
order by c.codigo;
