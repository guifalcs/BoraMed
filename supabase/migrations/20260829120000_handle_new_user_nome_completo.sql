-- Regressão: a migration 20260828210000 fez `create or replace` de
-- handle_new_user() para ler faculdade_unidade do metadata, mas o corpo novo
-- deixou de gravar nome_completo — campo que a versão anterior em produção
-- preenchia a partir de raw_user_meta_data->>'full_name'. Efeito: todo perfil
-- criado a partir de 28/08/2026 nasce com nome_completo nulo, e a UI cai no
-- fallback de e-mail (dashboard, ranking, comentários, campanhas).
--
-- Restaura o preenchimento do nome mantendo a lógica de faculdade_unidade.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_faculdade_unidade text := new.raw_user_meta_data ->> 'faculdade_unidade';
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

  insert into public.profiles (id, email, nome_completo, faculdade_unidade)
  values (new.id, new.email, v_nome_completo, v_faculdade_unidade);
  return new;
end;
$$;

-- Backfill dos perfis criados na janela da regressão: recupera o nome do
-- metadata de auth.users, que segue intacto. Só toca em quem está sem nome,
-- para não sobrescrever quem já corrigiu na tela de perfil.
update public.profiles p
set nome_completo = nullif(
  left(trim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  )), 200),
  ''
)
from auth.users u
where u.id = p.id
  and nullif(trim(p.nome_completo), '') is null
  and nullif(trim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  )), '') is not null;
