-- Preserva a ordem sorteada das questões dentro de cada tentativa.
-- Isso é necessário para revisar simulados personalizados na mesma sequência
-- em que o aluno respondeu.

alter table public.tentativa_resposta
add column if not exists ordem_na_tentativa integer;

create index if not exists idx_tentativa_resposta_tentativa_ordem
on public.tentativa_resposta (tentativa_id, ordem_na_tentativa);

with numeradas as (
  select
    id,
    row_number() over (
      partition by tentativa_id
      order by id
    ) as ordem
  from public.tentativa_resposta
  where ordem_na_tentativa is null
)
update public.tentativa_resposta tr
set ordem_na_tentativa = numeradas.ordem
from numeradas
where tr.id = numeradas.id;

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
  v_user_id       uuid;
  v_prova_id      uuid;
  v_tentativa     record;
  v_questoes      jsonb;
  v_total         int;
  v_result        jsonb;
  v_nome          text;
  v_selected_ids  uuid[];
  v_edicao        int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if p_modo not in ('simulado', 'estudo') then
    raise exception 'Modo inválido: %', p_modo using errcode = 'P0002';
  end if;

  if p_qtd < 1 or p_qtd > 50 then
    raise exception 'Quantidade deve ser entre 1 e 50' using errcode = 'P0006';
  end if;

  select array(
    select q.id
    from questao q
    where q.status = 'ativa'
      and (
        p_tema_ids is null
        or array_length(p_tema_ids, 1) is null
        or exists (
          select 1
          from questao_tema qt
          where qt.questao_id = q.id
            and qt.tema_id = any(p_tema_ids)
        )
      )
    order by random()
    limit p_qtd
  ) into v_selected_ids;

  v_total := array_length(v_selected_ids, 1);

  if v_total is null or v_total = 0 then
    raise exception 'Nenhuma questão encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' using errcode = 'P0004';
  end if;

  if p_tema_ids is null or array_length(p_tema_ids, 1) is null then
    v_nome := 'Simulado personalizado — ' || v_total || ' questões';
  else
    select 'Simulado — ' || string_agg(t.nome, ', ' order by t.nome) || ' — ' || v_total || 'q'
    into v_nome
    from tema t
    where t.id = any(p_tema_ids);
  end if;

  if length(v_nome) > 200 then
    v_nome := left(v_nome, 197) || '...';
  end if;

  v_edicao := -(extract(epoch from clock_timestamp())::int % 2000000000);

  insert into prova (faculdade_id, nome, periodo, tipo, qtd_questoes, edicao)
  values (null, v_nome, 0, 'processual', v_total, v_edicao)
  returning id into v_prova_id;

  insert into tentativa (
    user_id, prova_id, modo, status,
    total_questoes, total_respondidas, acertos,
    iniciada_em, criado_em
  )
  values (
    v_user_id, v_prova_id, p_modo, 'em_andamento',
    v_total, 0, 0,
    now(), now()
  )
  returning * into v_tentativa;

  insert into tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  select v_tentativa.id, selected.questao_id, selected.ordem::integer
  from unnest(v_selected_ids) with ordinality as selected(questao_id, ordem);

  select jsonb_agg(
    jsonb_build_object(
      'id',                      q.id,
      'prova_id',                q.prova_id,
      'ordem_na_prova',          q.ordem_na_prova,
      'codigo_externo',          q.codigo_externo,
      'enunciado_apoio',         q.enunciado_apoio,
      'enunciado',               q.enunciado,
      'imagem_url',              q.imagem_url,
      'imagem_legenda',          q.imagem_legenda,
      'formato',                 q.formato,
      'explicacao',              q.explicacao,
      'dificuldade',             q.dificuldade,
      'disciplina',              q.disciplina,
      'periodo',                 q.periodo,
      'status',                  q.status,
      'criado_em',               q.criado_em,
      'atualizado_em',           q.atualizado_em,
      'alternativas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         a.id,
            'questao_id', a.questao_id,
            'letra',      a.letra,
            'texto',      a.texto,
            'correta',    case when p_modo = 'simulado' then null else a.correta end,
            'ordem',      a.ordem,
            'imagem_url', a.imagem_url
          ) order by a.ordem
        )
        from alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         t.id,
            'nome',       t.nome,
            'disciplina', t.disciplina,
            'periodo',    t.periodo,
            'parent_id',  t.parent_id,
            'criado_em',  t.criado_em
          )
        )
        from questao_tema qt2
        join tema t on t.id = qt2.tema_id
        where qt2.questao_id = q.id
      )
    )
    order by array_position(v_selected_ids, q.id)
  )
  into v_questoes
  from questao q
  where q.id = any(v_selected_ids);

  v_result := jsonb_build_object(
    'prova_id',   v_prova_id,
    'tentativa',  row_to_json(v_tentativa)::jsonb,
    'questoes',   coalesce(v_questoes, '[]'::jsonb)
  );

  return v_result;
end;
$function$;
