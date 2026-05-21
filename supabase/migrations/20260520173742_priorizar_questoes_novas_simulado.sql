-- Prioriza questoes ainda nao entregues ao aluno na montagem de simulado.
-- O historico vem de tentativa_resposta + tentativa, que ja registra as
-- questoes sorteadas para cada usuario em tentativas reais.

CREATE INDEX IF NOT EXISTS idx_tentativa_user_modo_id
  ON public.tentativa (user_id, modo, id);

CREATE OR REPLACE FUNCTION public.gerar_simulado_personalizado(
  p_tema_ids uuid[] DEFAULT NULL::uuid[],
  p_qtd integer DEFAULT 10,
  p_modo text DEFAULT 'simulado'::text,
  p_tipo_questao text DEFAULT NULL::text,
  p_formato text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid;
  v_prova_id uuid;
  v_tentativa record;
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
  v_edicao integer;
  v_insert_attempts integer := 0;
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

  if p_tipo_questao is not null and p_tipo_questao not in ('nacional', 'processual', 'laboratorio') then
    raise exception 'Tipo de questao invalido: %', p_tipo_questao using errcode = 'P0007';
  end if;

  if p_formato is not null and p_formato not in ('nacional', 'processual', 'laboratorio') then
    raise exception 'Formato invalido: %', p_formato using errcode = 'P0008';
  end if;

  select array(
    with questoes_entregues as (
      select distinct tr.questao_id
      from public.tentativa t
      join public.tentativa_resposta tr on tr.tentativa_id = t.id
      where t.user_id = v_user_id
        and t.modo <> 'visualizar'
    )
    select q.id
    from public.questao q
    left join questoes_entregues qe on qe.questao_id = q.id
    where q.status = 'ativa'
      and (p_tipo_questao is null or q.tipo_questao = p_tipo_questao)
      and (p_tipo_questao is distinct from 'laboratorio' or q.imagem_url is not null)
      and (
        p_formato is null
        or p_formato = 'laboratorio'
        or q.formato_prova is null
        or q.formato_prova = p_formato
        or (q.formato_prova in ('N1', 'N2', 'teste_progresso') and p_formato = 'nacional')
      )
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
    order by (qe.questao_id is not null) asc, random()
    limit p_qtd
  )
  into v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  if v_total = 0 then
    raise exception 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' using errcode = 'P0004';
  end if;

  if p_tema_ids is null or array_length(p_tema_ids, 1) is null then
    v_nome := case
      when p_formato is null then 'Simulado personalizado - '
      when p_tipo_questao = 'laboratorio' then 'Simulado laboratorio - '
      else 'Simulado personalizado - '
    end || v_total || ' questoes';
  else
    select case
      when p_formato is null then 'Simulado - '
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

  loop
    v_insert_attempts := v_insert_attempts + 1;
    v_edicao := -(((
      ((extract(epoch from clock_timestamp()) * 1000000)::bigint + floor(random() * 1000000)::bigint)
      % 1999999999
    ) + 1)::integer);

    begin
      insert into public.prova (
        faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo,
        qtd_questoes, edicao, publicada, arquivada
      )
      values (
        null, v_nome, 0, 'autoral', 'personalizado', p_formato, null, null,
        v_total, v_edicao, false, false
      )
      returning id into v_prova_id;

      exit;
    exception when unique_violation then
      if v_insert_attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

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

REVOKE EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text) TO authenticated;
