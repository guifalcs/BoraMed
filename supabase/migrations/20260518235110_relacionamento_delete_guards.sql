-- Relacionamentos criticos:
-- - bloquear delecoes que desmontam questoes/temas de forma silenciosa
-- - consolidar prova_questao como fonte de questoes de provas regulares
-- - persistir ordem da tentativa para retomada/revisao

alter table public.tentativa_resposta
  add column if not exists ordem_na_tentativa integer;

with ordenadas as (
  select
    id,
    row_number() over (partition by tentativa_id order by id)::integer as ordem
  from public.tentativa_resposta
  where ordem_na_tentativa is null
)
update public.tentativa_resposta tr
set ordem_na_tentativa = o.ordem
from ordenadas o
where tr.id = o.id;

create index if not exists idx_tentativa_resposta_ordem
  on public.tentativa_resposta (tentativa_id, ordem_na_tentativa);

drop policy if exists tentativa_resposta_select_own on public.tentativa_resposta;
drop policy if exists tentativa_resposta_select on public.tentativa_resposta;
create policy tentativa_resposta_select
  on public.tentativa_resposta
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.tentativa t
      where t.id = tentativa_resposta.tentativa_id
        and t.user_id = (select auth.uid())
    )
  );

alter table public.questao
  drop constraint if exists questao_disciplina_id_fkey;
alter table public.questao
  add constraint questao_disciplina_id_fkey
  foreign key (disciplina_id) references public.disciplina(id)
  on delete restrict not valid;
alter table public.questao validate constraint questao_disciplina_id_fkey;

alter table public.tema
  drop constraint if exists tema_disciplina_id_fkey;
alter table public.tema
  add constraint tema_disciplina_id_fkey
  foreign key (disciplina_id) references public.disciplina(id)
  on delete restrict not valid;
alter table public.tema validate constraint tema_disciplina_id_fkey;

alter table public.tema
  drop constraint if exists tema_parent_id_fkey;
alter table public.tema
  add constraint tema_parent_id_fkey
  foreign key (parent_id) references public.tema(id)
  on delete restrict not valid;
alter table public.tema validate constraint tema_parent_id_fkey;

alter table public.questao_tema
  drop constraint if exists questao_tema_tema_id_fkey;
alter table public.questao_tema
  add constraint questao_tema_tema_id_fkey
  foreign key (tema_id) references public.tema(id)
  on delete restrict not valid;
alter table public.questao_tema validate constraint questao_tema_tema_id_fkey;

alter table public.prova_questao
  drop constraint if exists prova_questao_questao_id_fkey;
alter table public.prova_questao
  add constraint prova_questao_questao_id_fkey
  foreign key (questao_id) references public.questao(id)
  on delete restrict not valid;
alter table public.prova_questao validate constraint prova_questao_questao_id_fkey;

set check_function_bodies = off;

create or replace function public.iniciar_tentativa(p_prova_id uuid, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_prova record;
  v_tentativa record;
  v_questoes jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if p_modo not in ('simulado', 'estudo', 'visualizar') then
    raise exception 'Modo invalido: %', p_modo using errcode = 'P0002';
  end if;

  select p.*, count(pq.questao_id) filter (where q.status = 'ativa') as total
  into v_prova
  from public.prova p
  left join public.prova_questao pq on pq.prova_id = p.id
  left join public.questao q on q.id = pq.questao_id
  where p.id = p_prova_id
  group by p.id;

  if not found then
    raise exception 'Prova nao encontrada' using errcode = 'P0003';
  end if;

  if v_prova.total = 0 then
    raise exception 'A prova nao possui questoes ativas' using errcode = 'P0004';
  end if;

  insert into public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  values (
    v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0,
    0, now(), now()
  )
  returning * into v_tentativa;

  insert into public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  select v_tentativa.id, q.id, row_number() over (order by pq.ordem, q.id)::integer
  from public.prova_questao pq
  join public.questao q on q.id = pq.questao_id
  where pq.prova_id = p_prova_id
    and q.status = 'ativa'
  order by pq.ordem, q.id;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', p_prova_id,
      'ordem_na_prova', tr.ordem_na_tentativa,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
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
    order by tr.ordem_na_tentativa
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  where tr.tentativa_id = v_tentativa.id;

  return jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
end;
$function$;

create or replace function public.retomar_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_tentativa record;
  v_questoes jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  select *
  into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status = 'finalizada' then
    raise exception 'Tentativa ja finalizada' using errcode = 'P0005';
  end if;

  update public.tentativa
  set status = 'em_andamento',
      pausada_em = null
  where id = p_tentativa_id
  returning * into v_tentativa;

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
          'correta', case when v_tentativa.modo = 'simulado' then null else a.correta end,
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
    order by coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id;

  return jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
end;
$function$;

drop function if exists public.finalizar_tentativa(uuid);

create or replace function public.finalizar_tentativa(
  p_tentativa_id uuid,
  p_tempo_segundos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_tentativa record;
  v_acertos integer;
  v_total_respondidas integer;
  v_nota numeric(5,2);
  v_questoes jsonb;
  v_respostas jsonb;
  v_distribuicao jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  select *
  into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status <> 'finalizada' then
    update public.tentativa_resposta tr
    set correta = (
      tr.alternativa_id is not null
      and tr.alternativa_id = (
        select a.id
        from public.alternativa a
        where a.questao_id = tr.questao_id
          and a.correta = true
        order by a.ordem
        limit 1
      )
    )
    where tr.tentativa_id = p_tentativa_id;

    select
      count(*) filter (where tr.correta = true),
      count(*) filter (where tr.respondida_em is not null)
    into v_acertos, v_total_respondidas
    from public.tentativa_resposta tr
    where tr.tentativa_id = p_tentativa_id;

    v_nota := round((v_acertos::numeric / nullif(v_tentativa.total_questoes, 0)) * 100, 1);

    update public.tentativa
    set status = 'finalizada',
        finalizada_em = now(),
        acertos = v_acertos,
        total_respondidas = v_total_respondidas,
        nota = v_nota,
        tempo_acumulado_segundos = coalesce(p_tempo_segundos, tempo_acumulado_segundos)
    where id = p_tentativa_id
    returning * into v_tentativa;

    update public.questao q
    set vezes_respondida = q.vezes_respondida + 1,
        vezes_acertada = q.vezes_acertada + case when tr.correta then 1 else 0 end,
        taxa_acerto = round(
          ((q.vezes_acertada + case when tr.correta then 1 else 0 end)::numeric
            / (q.vezes_respondida + 1)) * 100,
          2
        )
    from public.tentativa_resposta tr
    where tr.tentativa_id = p_tentativa_id
      and tr.questao_id = q.id
      and tr.respondida_em is not null;
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
          'correta', a.correta,
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
    order by coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina d on d.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id;

  select jsonb_agg(row_to_json(tr)::jsonb order by coalesce(tr.ordem_na_tentativa, 2147483647), tr.id)
  into v_respostas
  from public.tentativa_resposta tr
  where tr.tentativa_id = p_tentativa_id;

  select jsonb_agg(
    jsonb_build_object(
      'tema', jsonb_build_object(
        'id', sub.tema_id,
        'nome', sub.tema_nome,
        'disciplina_id', sub.disciplina_id,
        'disciplina', sub.disciplina_sigla,
        'periodo', sub.disciplina_periodo,
        'parent_id', sub.parent_id,
        'criado_em', sub.criado_em
      ),
      'total', sub.total,
      'acertos', sub.acertos
    )
    order by sub.tema_nome
  )
  into v_distribuicao
  from (
    select
      t.id as tema_id,
      t.nome as tema_nome,
      t.disciplina_id,
      d.sigla as disciplina_sigla,
      d.periodo::integer as disciplina_periodo,
      t.parent_id,
      t.criado_em,
      count(tr.id)::integer as total,
      count(tr.id) filter (where tr.correta = true)::integer as acertos
    from public.tentativa_resposta tr
    join public.questao_tema qt on qt.questao_id = tr.questao_id
    join public.tema t on t.id = qt.tema_id
    left join public.disciplina d on d.id = t.disciplina_id
    where tr.tentativa_id = p_tentativa_id
    group by t.id, t.nome, t.disciplina_id, d.sigla, d.periodo, t.parent_id, t.criado_em
  ) sub;

  return jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb),
    'respostas', coalesce(v_respostas, '[]'::jsonb),
    'distribuicao_temas', coalesce(v_distribuicao, '[]'::jsonb)
  );
end;
$function$;

create or replace function public.gerar_simulado_personalizado(
  p_tema_ids uuid[] default null::uuid[],
  p_qtd integer default 10,
  p_modo text default 'simulado'::text
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

  select array(
    select q.id
    from public.questao q
    where q.status = 'ativa'
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
    v_nome := 'Simulado personalizado - ' || v_total || ' questoes';
  else
    select 'Simulado - ' || string_agg(t.nome, ', ' order by t.nome) || ' - ' || v_total || 'q'
    into v_nome
    from public.tema t
    where t.id = any(p_tema_ids);
  end if;

  if length(v_nome) > 200 then
    v_nome := left(v_nome, 197) || '...';
  end if;

  v_edicao := -(extract(epoch from clock_timestamp())::integer % 2000000000);

  insert into public.prova (faculdade_id, nome, periodo, tipo, qtd_questoes, edicao)
  values (null, v_nome, 0, 'processual', v_total, v_edicao)
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

revoke execute on function public.iniciar_tentativa(uuid, text) from public;
revoke execute on function public.retomar_tentativa(uuid) from public;
revoke execute on function public.finalizar_tentativa(uuid, integer) from public;
revoke execute on function public.gerar_simulado_personalizado(uuid[], integer, text) from public;

revoke execute on function public.iniciar_tentativa(uuid, text) from anon;
revoke execute on function public.retomar_tentativa(uuid) from anon;
revoke execute on function public.finalizar_tentativa(uuid, integer) from anon;
revoke execute on function public.gerar_simulado_personalizado(uuid[], integer, text) from anon;

grant execute on function public.iniciar_tentativa(uuid, text) to authenticated;
grant execute on function public.retomar_tentativa(uuid) to authenticated;
grant execute on function public.finalizar_tentativa(uuid, integer) to authenticated;
grant execute on function public.gerar_simulado_personalizado(uuid[], integer, text) to authenticated;
