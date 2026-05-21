-- Add tipo_questao to questao, upgrade gerar_simulado_personalizado to 5-param version,
-- and fix questao-imagens storage policies (SELECT open to authenticated, add UPDATE).

alter table public.questao
  add column if not exists tipo_questao text not null default 'geral';

alter table public.questao
  drop constraint if exists questao_tipo_questao_check,
  drop constraint if exists questao_laboratorio_imagem_check;

alter table public.questao
  add constraint questao_tipo_questao_check
    check (tipo_questao in ('geral', 'laboratorio')),
  add constraint questao_laboratorio_imagem_check
    check (tipo_questao <> 'laboratorio' or imagem_url is not null);

create index if not exists idx_questao_tipo_questao on public.questao (tipo_questao);

-- Storage policies
drop policy if exists "questao-imagens: leitura admin" on storage.objects;
drop policy if exists "questao-imagens: upload admin" on storage.objects;
drop policy if exists "questao-imagens: delete admin" on storage.objects;
drop policy if exists "questao_imagens_select_authenticated" on storage.objects;
drop policy if exists "questao_imagens_admin_insert" on storage.objects;
drop policy if exists "questao_imagens_admin_update" on storage.objects;
drop policy if exists "questao_imagens_admin_delete" on storage.objects;

create policy "questao_imagens_select_authenticated"
  on storage.objects
  for select to authenticated
  using (bucket_id = 'questao-imagens');

create policy "questao_imagens_admin_insert"
  on storage.objects
  for insert to authenticated
  with check (bucket_id = 'questao-imagens' and public.is_admin());

create policy "questao_imagens_admin_update"
  on storage.objects
  for update to authenticated
  using (bucket_id = 'questao-imagens' and public.is_admin())
  with check (bucket_id = 'questao-imagens' and public.is_admin());

create policy "questao_imagens_admin_delete"
  on storage.objects
  for delete to authenticated
  using (bucket_id = 'questao-imagens' and public.is_admin());

set check_function_bodies = off;

create or replace function public.gerar_simulado_personalizado(
  p_tema_ids uuid[] default null::uuid[],
  p_qtd integer default 10,
  p_modo text default 'simulado'::text,
  p_tipo_questao text default 'geral'::text,
  p_formato text default 'processual'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_prova_id uuid;
  v_tentativa record;
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
  v_edicao integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if p_modo not in ('simulado', 'estudo') then
    raise exception 'Modo invalido: %', p_modo using errcode = 'P0002';
  end if;

  if p_qtd < 1 or p_qtd > 50 then
    raise exception 'Quantidade deve ser entre 1 e 50' using errcode = 'P0006';
  end if;

  if p_tipo_questao not in ('geral', 'laboratorio') then
    raise exception 'Tipo de questao invalido: %', p_tipo_questao using errcode = 'P0007';
  end if;

  if p_formato not in ('nacional', 'processual', 'laboratorio', 'multiestacoes') then
    raise exception 'Formato invalido: %', p_formato using errcode = 'P0008';
  end if;

  select array(
    select q.id
    from public.questao q
    where q.status = 'ativa'
      and q.tipo_questao = p_tipo_questao
      and (p_tipo_questao <> 'laboratorio' or q.imagem_url is not null)
      and (
        p_tema_ids is null
        or array_length(p_tema_ids, 1) is null
        or exists (
          select 1
          from public.questao_tema qt
          where qt.questao_id = q.id
            and qt.tema_id = any(p_tema_ids)
        )
      )
    order by random()
    limit p_qtd
  )
  into v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  if v_total = 0 then
    raise exception 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' using errcode = 'P0004';
  end if;

  if p_tema_ids is null or array_length(p_tema_ids, 1) is null then
    v_nome := case
      when p_tipo_questao = 'laboratorio' then 'Simulado laboratorio - '
      else 'Simulado personalizado - '
    end || v_total || ' questoes';
  else
    select case
      when p_tipo_questao = 'laboratorio' then 'Simulado laboratorio - '
      else 'Simulado - '
    end || string_agg(t.nome, ', ' order by t.nome) || ' - ' || v_total || 'q'
    into v_nome
    from public.tema t
    where t.id = any(p_tema_ids);
  end if;

  if length(v_nome) > 200 then
    v_nome := left(v_nome, 197) || '...';
  end if;

  v_edicao := -(extract(epoch from clock_timestamp())::int % 2000000000);

  insert into public.prova (
    faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo,
    qtd_questoes, edicao, publicada, arquivada
  )
  values (
    null, v_nome, 0, 'autoral', 'personalizado', p_formato, null, null,
    v_total, v_edicao, false, false
  )
  returning id into v_prova_id;

  insert into public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  values (
    v_user_id, v_prova_id, p_modo, 'em_andamento', v_total, 0,
    0, now(), now()
  )
  returning * into v_tentativa;

  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  select v_tentativa.id, selected.questao_id, selected.ordem::integer
  from unnest(v_selected_ids) with ordinality as selected(questao_id, ordem);

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_prova_id,
      'ordem_na_prova', selected.ordem::integer,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'tipo_questao', q.tipo_questao,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'dificuldade', q.dificuldade,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', case when p_modo = 'simulado' then null else a.correta end,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) order by a.ordem), '[]'::jsonb)
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) order by t.nome), '[]'::jsonb)
        from public.questao_tema qt
        join public.tema t on t.id = qt.tema_id
        left join public.disciplina td on td.id = t.disciplina_id
        where qt.questao_id = q.id
      )
    )
    order by selected.ordem
  )
  into v_questoes
  from unnest(v_selected_ids) with ordinality as selected(questao_id, ordem)
  join public.questao q on q.id = selected.questao_id
  left join public.disciplina d on d.id = q.disciplina_id;

  return jsonb_build_object(
    'prova_id', v_prova_id,
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
end;
$function$;

drop function if exists public.gerar_simulado_personalizado(uuid[], integer, text);

revoke execute on function public.gerar_simulado_personalizado(uuid[], integer, text, text, text) from public;
revoke execute on function public.gerar_simulado_personalizado(uuid[], integer, text, text, text) from anon;
grant execute on function public.gerar_simulado_personalizado(uuid[], integer, text, text, text) to authenticated;
