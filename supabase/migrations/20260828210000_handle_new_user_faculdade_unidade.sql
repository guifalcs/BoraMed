-- Cadastro por e-mail/senha agora coleta a unidade Afya no próprio formulário
-- e manda via options.data do signUp; o trigger de criação de profile precisa
-- ler esse metadata. Cadastro via Google não passa por aqui (sem metadata
-- custom no OAuth) — esses usuários seguem caindo no modal obrigatório do
-- dashboard até preencherem depois.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_faculdade_unidade text := new.raw_user_meta_data ->> 'faculdade_unidade';
begin
  -- raw_user_meta_data é preenchido pelo cliente (options.data do signUp) e
  -- não é confiável: um valor fora da lista permitida faria o INSERT abaixo
  -- violar o CHECK da coluna e abortar a criação de toda a conta. Descarta
  -- silenciosamente o que não bate com o CHECK em vez de propagar o erro —
  -- o modal obrigatório do dashboard cobre o usuário resultante sem unidade.
  if v_faculdade_unidade is not null and v_faculdade_unidade not in (
    'abaetetuba_pa', 'araguaina_to', 'braganca_pa', 'cabedelo_pb', 'contagem_mg',
    'cruzeiro_do_sul_ac', 'duque_de_caxias_rj', 'garanhuns_pe', 'guanambi_ba', 'ipatinga_mg',
    'itabuna_ba', 'itacoatiara_am', 'itajuba_mg', 'itaperuna_rj', 'jaboatao_pe',
    'ji_parana_ro', 'maceio_al', 'manacapuru_am', 'maraba_pa', 'montes_claros_mg',
    'palmas_to', 'parnaiba_pi', 'pato_branco_pr', 'porto_nacional_to', 'porto_velho_ro',
    'redencao_pa', 'rio_de_janeiro_rj', 'salvador_ba', 'santa_ines_ma', 'sao_joao_del_rei_mg',
    'teresina_pi', 'vitoria_da_conquista_ba'
  ) then
    v_faculdade_unidade := null;
  end if;

  insert into public.profiles (id, email, faculdade_unidade)
  values (new.id, new.email, v_faculdade_unidade);
  return new;
end;
$$;
