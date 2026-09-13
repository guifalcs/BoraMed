-- 1) Coluna periodo: existe em produção desde os "personal fields", mas a
-- migration correspondente ficou vazia no repo, então o banco local (e
-- qualquer ambiente recriado por db reset) nasce sem ela.
alter table public.profiles
  add column if not exists periodo smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.conname = 'profiles_periodo_check'
  ) then
    alter table public.profiles
      add constraint profiles_periodo_check check (periodo >= 1 and periodo <= 12);
  end if;
end;
$$;

-- 2) O cadastro passa a exigir período junto da unidade; grava os dois a
-- partir do metadata do signUp.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_faculdade_unidade text := new.raw_user_meta_data ->> 'faculdade_unidade';
  v_periodo smallint;
  -- Cadastro por e-mail/senha manda 'full_name' (options.data do signUp); o
  -- Google manda 'full_name' e 'name'. O coalesce cobre os dois provedores.
  -- Metadata é preenchido pelo cliente: trim + limite de tamanho evitam gravar
  -- lixo arbitrário numa coluna que aparece em ranking e e-mails de campanha.
  v_nome_completo text := nullif(
    left(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), 200),
    ''
  );
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

  -- Mesmo raciocínio do CHECK acima: metadata inválido (texto, fora de 1..12)
  -- vira null e cai no modal obrigatório, em vez de abortar o cadastro.
  begin
    v_periodo := (new.raw_user_meta_data ->> 'periodo')::smallint;
  exception when others then
    v_periodo := null;
  end;

  if v_periodo is not null and (v_periodo < 1 or v_periodo > 12) then
    v_periodo := null;
  end if;

  insert into public.profiles (id, email, nome_completo, faculdade_unidade, periodo)
  values (new.id, new.email, v_nome_completo, v_faculdade_unidade, v_periodo);
  return new;
end;
$$;
