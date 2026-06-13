-- Anotacoes privadas por usuario, tentativa e questao.
-- A mesma questao em outra tentativa nao herda anotacao.

create table public.tentativa_questao_anotacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tentativa_id uuid not null references public.tentativa(id) on delete cascade,
  questao_id uuid not null references public.questao(id) on delete restrict,
  conteudo text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tentativa_questao_anotacao_conteudo_check
    check (char_length(btrim(conteudo)) between 1 and 5000),
  constraint tentativa_questao_anotacao_unique
    unique (user_id, tentativa_id, questao_id)
);

alter table public.tentativa_questao_anotacao enable row level security;

create index idx_tentativa_questao_anotacao_tentativa
  on public.tentativa_questao_anotacao (tentativa_id);

create index idx_tentativa_questao_anotacao_user_tentativa
  on public.tentativa_questao_anotacao (user_id, tentativa_id);

create index idx_tentativa_questao_anotacao_questao
  on public.tentativa_questao_anotacao (questao_id);

create trigger tentativa_questao_anotacao_atualizado_em_trigger
  before update on public.tentativa_questao_anotacao
  for each row execute function public.update_atualizado_em();

-- Exposicao explicita para Data API com RLS obrigatorio.
revoke all on table public.tentativa_questao_anotacao from anon;
grant select, insert, update, delete on table public.tentativa_questao_anotacao to authenticated;
grant select, insert, update, delete on table public.tentativa_questao_anotacao to service_role;

create policy tentativa_questao_anotacao_select_own
  on public.tentativa_questao_anotacao
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tentativa t
      where t.id = tentativa_questao_anotacao.tentativa_id
        and t.user_id = (select auth.uid())
        and t.status = 'finalizada'
    )
  );

create policy tentativa_questao_anotacao_insert_own
  on public.tentativa_questao_anotacao
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tentativa t
      where t.id = tentativa_questao_anotacao.tentativa_id
        and t.user_id = (select auth.uid())
        and t.status = 'finalizada'
    )
    and exists (
      select 1
      from public.tentativa_resposta tr
      where tr.tentativa_id = tentativa_questao_anotacao.tentativa_id
        and tr.questao_id = tentativa_questao_anotacao.questao_id
    )
  );

create policy tentativa_questao_anotacao_update_own
  on public.tentativa_questao_anotacao
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tentativa t
      where t.id = tentativa_questao_anotacao.tentativa_id
        and t.user_id = (select auth.uid())
        and t.status = 'finalizada'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tentativa t
      where t.id = tentativa_questao_anotacao.tentativa_id
        and t.user_id = (select auth.uid())
        and t.status = 'finalizada'
    )
    and exists (
      select 1
      from public.tentativa_resposta tr
      where tr.tentativa_id = tentativa_questao_anotacao.tentativa_id
        and tr.questao_id = tentativa_questao_anotacao.questao_id
    )
  );

create policy tentativa_questao_anotacao_delete_own
  on public.tentativa_questao_anotacao
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tentativa t
      where t.id = tentativa_questao_anotacao.tentativa_id
        and t.user_id = (select auth.uid())
        and t.status = 'finalizada'
    )
  );

create or replace function public.listar_anotacoes_tentativa(p_tentativa_id uuid)
returns setof public.tentativa_questao_anotacao
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select a.*
  from public.tentativa_questao_anotacao a
  where a.tentativa_id = p_tentativa_id
  order by a.atualizado_em desc, a.criado_em desc;
$$;

create or replace function public.salvar_anotacao_questao(
  p_tentativa_id uuid,
  p_questao_id uuid,
  p_conteudo text
)
returns public.tentativa_questao_anotacao
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_conteudo text := btrim(coalesce(p_conteudo, ''));
  v_anotacao public.tentativa_questao_anotacao;
begin
  if v_conteudo = '' then
    delete from public.tentativa_questao_anotacao
    where user_id = auth.uid()
      and tentativa_id = p_tentativa_id
      and questao_id = p_questao_id;

    return null;
  end if;

  insert into public.tentativa_questao_anotacao (
    user_id,
    tentativa_id,
    questao_id,
    conteudo
  )
  values (
    auth.uid(),
    p_tentativa_id,
    p_questao_id,
    v_conteudo
  )
  on conflict (user_id, tentativa_id, questao_id)
  do update set
    conteudo = excluded.conteudo,
    atualizado_em = now()
  returning *
  into v_anotacao;

  return v_anotacao;
end;
$$;

create or replace function public.excluir_anotacao_questao(
  p_tentativa_id uuid,
  p_questao_id uuid
)
returns void
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $$
  delete from public.tentativa_questao_anotacao
  where user_id = auth.uid()
    and tentativa_id = p_tentativa_id
    and questao_id = p_questao_id;
$$;

create or replace function public.get_revisao_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_tentativa public.tentativa;
  v_questoes jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  v_is_admin := public.is_admin(v_user_id);

  select t.*
  into v_tentativa
  from public.tentativa t
  where t.id = p_tentativa_id
    and (t.user_id = v_user_id or v_is_admin);

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status <> 'finalizada' and not v_is_admin then
    raise exception 'Revisao disponivel apenas apos finalizar a tentativa' using errcode = 'P0005';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_tentativa.prova_id,
      'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
          'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url
        ) order by a.ordem), '[]'::jsonb)
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', tema.id, 'nome', tema.nome, 'disciplina_id', tema.disciplina_id,
          'disciplina', td.sigla, 'periodo', td.periodo::integer,
          'parent_id', tema.parent_id, 'criado_em', tema.criado_em
        ) order by tema.nome), '[]'::jsonb)
        from public.questao_tema qt
        join public.tema tema on tema.id = qt.tema_id
        left join public.disciplina td on td.id = tema.disciplina_id
        where qt.questao_id = q.id
      )
    )
    order by coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id;

  return jsonb_build_object(
    'tentativa', to_jsonb(v_tentativa),
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.listar_anotacoes_tentativa(uuid) from public;
revoke execute on function public.salvar_anotacao_questao(uuid, uuid, text) from public;
revoke execute on function public.excluir_anotacao_questao(uuid, uuid) from public;
revoke execute on function public.get_revisao_tentativa(uuid) from public;

revoke execute on function public.listar_anotacoes_tentativa(uuid) from anon;
revoke execute on function public.salvar_anotacao_questao(uuid, uuid, text) from anon;
revoke execute on function public.excluir_anotacao_questao(uuid, uuid) from anon;
revoke execute on function public.get_revisao_tentativa(uuid) from anon;

grant execute on function public.listar_anotacoes_tentativa(uuid) to authenticated;
grant execute on function public.salvar_anotacao_questao(uuid, uuid, text) to authenticated;
grant execute on function public.excluir_anotacao_questao(uuid, uuid) to authenticated;
grant execute on function public.get_revisao_tentativa(uuid) to authenticated;
