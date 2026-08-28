-- Substitui a "rede" (Rede Afya / Outros) pela unidade Afya real do aluno,
-- já que hoje todo aluno cadastrado é estudante de Medicina de alguma
-- unidade do grupo Afya. Perfis existentes perdem o valor antigo (nenhuma
-- unidade da lista nova corresponde a 'rede_afya'/'outros') e ficam sem
-- unidade até preencherem via modal obrigatório no dashboard.

update public.profiles set faculdade_rede = null;

alter table public.profiles rename column faculdade_rede to faculdade_unidade;

-- O rename de coluna não renomeia a constraint (nome gerado a partir do nome
-- antigo da coluna) — localiza pelo corpo da constraint em vez de assumir o
-- nome por convenção.
do $$
declare
  v_conname text;
begin
  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%faculdade_unidade%';

  if v_conname is not null then
    execute format('alter table public.profiles drop constraint %I', v_conname);
  end if;
end;
$$;

-- 32 unidades com curso de Medicina do Grupo Afya (sitemap de
-- medicina.afya.com.br/unidades, conferido em 28/08/2026). Nova unidade
-- exige nova migration alterando este CHECK.
alter table public.profiles
  add constraint profiles_faculdade_unidade_check
  check (faculdade_unidade in (
    'abaetetuba_pa', 'araguaina_to', 'braganca_pa', 'cabedelo_pb', 'contagem_mg',
    'cruzeiro_do_sul_ac', 'duque_de_caxias_rj', 'garanhuns_pe', 'guanambi_ba', 'ipatinga_mg',
    'itabuna_ba', 'itacoatiara_am', 'itajuba_mg', 'itaperuna_rj', 'jaboatao_pe',
    'ji_parana_ro', 'maceio_al', 'manacapuru_am', 'maraba_pa', 'montes_claros_mg',
    'palmas_to', 'parnaiba_pi', 'pato_branco_pr', 'porto_nacional_to', 'porto_velho_ro',
    'redencao_pa', 'rio_de_janeiro_rj', 'salvador_ba', 'santa_ines_ma', 'sao_joao_del_rei_mg',
    'teresina_pi', 'vitoria_da_conquista_ba'
  ));
