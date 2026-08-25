-- ============================================================================
-- Troca de formato em tempo de prova: fechada ⇄ discursiva gêmea
--
-- O aluno, durante o simulado, pode trocar a questão pela GÊMEA do outro
-- formato (mesmo `grupo_equivalencia_id`). Só existe onde existe gêmea, e
-- gêmea só existe em acervo NÃO-NACIONAL (ver 20260824173517).
--
-- Por que isso é barato e não quebra histórico/nota/métrica:
--   * Simulado não-nacional é sempre PERSONALIZADO — `gerar_simulado_personalizado`
--     cria a `prova` (origem='personalizado') e insere direto em
--     `tentativa_resposta`, SEM linha em `prova_questao`. A prova é privada
--     daquela tentativa: não há estado compartilhado a corromper.
--   * Resultado, revisão, KPIs de histórico, desempenho por tema e stats de
--     questão derivam todos de `tentativa_resposta → questao`. Trocar o
--     `questao_id` da linha propaga sozinho.
--   * Nota já mistura formatos pela expressão canônica
--     `coalesce(tr.pontos, correta::int*100)` — é o caso `misto`, que existe.
--   * `total_pontuaveis` é calculado na consolidação, depois da troca.
--   * A gêmea herda `questao_tema` da origem, então a distribuição por tema
--     não muda de bucket.
--   * Rodízio/dedup do sorteio já operam por `coalesce(grupo_equivalencia_id, id)`:
--     para eles as duas variantes SEMPRE foram a mesma questão lógica.
--
-- Regra de bloqueio: só troca enquanto a questão está INTOCADA
-- (`respondida_em is null and enviada_em is null`). Depois de enviada, a
-- discursiva já tem `resposta_correcao` criada e custo de IA gasto; depois de
-- respondida, a MC já pode ter revelado o gabarito em modo estudo.
-- Rascunho de texto não bloqueia — é descartado (a UI avisa).
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

------------------------------------------------------------------------------
-- 1. Helper interno: payload de UMA questão no mesmo contrato (e com a MESMA
--    máscara de gabarito) de iniciar_tentativa/retomar_tentativa.
--    Sem grant para clientes — só as RPCs abaixo chamam.
------------------------------------------------------------------------------

create or replace function public.montar_questao_tentativa_json(
  p_questao_id uuid,
  p_modo       text,
  p_prova_id   uuid,
  p_ordem      integer
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'id', q.id,
    'prova_id', p_prova_id,
    'ordem_na_prova', p_ordem,
    'codigo_externo', q.codigo_externo,
    'enunciado_apoio', q.enunciado_apoio,
    'enunciado', q.enunciado,
    'imagem_url', q.imagem_url,
    'imagem_legenda', q.imagem_legenda,
    'formato', q.formato,
    'explicacao', q.explicacao,
    'referencia', q.referencia,
    'resposta_modelo', case when p_modo = 'simulado' then null else q.resposta_modelo end,
    'pontos_chave', case when p_modo = 'simulado' then '[]'::jsonb else coalesce(q.pontos_chave, '[]'::jsonb) end,
    'criterios_correcao', case when p_modo = 'simulado' then null else q.criterios_correcao end,
    'recurso_texto', q.recurso_texto,
    'anulada', q.anulada,
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
  from public.questao q
  left join public.disciplina d on d.id = q.disciplina_id
  where q.id = p_questao_id;
$$;

comment on function public.montar_questao_tentativa_json(uuid, text, uuid, integer) is
  'Interno: payload de uma questão no contrato de iniciar_tentativa, com a mesma máscara de gabarito em modo simulado. Sem grant para anon/authenticated.';

revoke all on function public.montar_questao_tentativa_json(uuid, text, uuid, integer)
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. get_gemeas_tentativa — mapa questao_id → gêmea disponível na tentativa.
--    Chamada UMA vez ao carregar a tela. Não expõe gabarito: só ids e formato.
------------------------------------------------------------------------------

create or replace function public.get_gemeas_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_result  jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.tentativa t
    where t.id = p_tentativa_id and t.user_id = v_user_id
  ) then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'questao_id', x.questao_id,
    'gemea_id', x.gemea_id,
    'formato_atual', x.formato_atual,
    'formato_gemea', x.formato_gemea
  ) order by x.ordem), '[]'::jsonb)
  into v_result
  from (
    select
      tr.questao_id,
      tr.ordem_na_tentativa as ordem,
      q.formato             as formato_atual,
      g.id                  as gemea_id,
      g.formato             as formato_gemea
    from public.tentativa_resposta tr
    join public.questao q on q.id = tr.questao_id
    join lateral (
      select g2.id, g2.formato
      from public.questao g2
      where g2.grupo_equivalencia_id = q.grupo_equivalencia_id
        and g2.id <> q.id
        and g2.formato <> q.formato
        and g2.status = 'ativa'
        and not g2.anulada
        -- a gêmea não pode já estar na mesma tentativa (viraria questão
        -- duplicada na tela: não há unique em (tentativa_id, questao_id))
        and not exists (
          select 1 from public.tentativa_resposta tr2
          where tr2.tentativa_id = tr.tentativa_id
            and tr2.questao_id = g2.id
        )
      order by g2.criado_em, g2.id
      limit 1
    ) g on true
    where tr.tentativa_id = p_tentativa_id
      and q.grupo_equivalencia_id is not null
      and q.tipo_questao <> 'nacional'
  ) x;

  return v_result;
end;
$$;

comment on function public.get_gemeas_tentativa(uuid) is
  'Mapa questao_id → gêmea trocável dentro da tentativa (id + formato). Não expõe gabarito. Só o dono da tentativa.';

revoke all on function public.get_gemeas_tentativa(uuid) from public, anon;
grant execute on function public.get_gemeas_tentativa(uuid) to authenticated;

------------------------------------------------------------------------------
-- 3. trocar_formato_questao_tentativa — a troca em si (UPDATE de uma linha).
--    Devolve a questão nova JÁ MASCARADA conforme o modo da tentativa, a linha
--    de resposta atualizada e o mapa da gêmea invertido (para a UI não refazer
--    get_gemeas_tentativa depois de trocar).
------------------------------------------------------------------------------

create or replace function public.trocar_formato_questao_tentativa(
  p_tentativa_id uuid, p_questao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id   uuid := auth.uid();
  v_tentativa record;
  v_questao   record;
  v_gemea     record;
  v_resposta  public.tentativa_resposta;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Tentativa nao encontrada ou sem permissao' using errcode = 'P0003';
  end if;

  if v_tentativa.status = 'finalizada' then
    raise exception 'Tentativa ja finalizada' using errcode = 'P0005';
  end if;

  -- Modo visualizar não tem resposta a dar: trocar ali não faz sentido.
  if v_tentativa.modo not in ('simulado', 'estudo') then
    raise exception 'Troca de formato indisponivel neste modo' using errcode = 'P0002';
  end if;

  select q.* into v_questao
  from public.questao q
  where q.id = p_questao_id;

  if not found then
    raise exception 'Questao nao encontrada' using errcode = 'P0004';
  end if;

  if v_questao.grupo_equivalencia_id is null or v_questao.tipo_questao = 'nacional' then
    raise exception 'Questao nao possui versao equivalente' using errcode = 'P0013';
  end if;

  -- Acervo não-nacional é exclusivo do plano Avançado (mesma regra de
  -- iniciar_tentativa/gerar_simulado_personalizado). Guard redundante na
  -- prática — não se chega a uma tentativa dessas sem o tier — mas a RPC é
  -- chamável direto.
  if public.nivel_acesso() in ('gratuito', 'essencial') then
    raise exception 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' using errcode = 'P0015';
  end if;

  select g.* into v_gemea
  from public.questao g
  where g.grupo_equivalencia_id = v_questao.grupo_equivalencia_id
    and g.id <> v_questao.id
    and g.formato <> v_questao.formato
    and g.status = 'ativa'
    and not g.anulada
    and not exists (
      select 1 from public.tentativa_resposta tr2
      where tr2.tentativa_id = p_tentativa_id
        and tr2.questao_id = g.id
    )
  order by g.criado_em, g.id
  limit 1;

  if not found then
    raise exception 'Questao nao possui versao equivalente disponivel' using errcode = 'P0013';
  end if;

  -- Só troca o que ainda está intocado. `resposta_texto` (rascunho) é
  -- descartado junto com a troca — pertence ao enunciado antigo.
  update public.tentativa_resposta tr
  set questao_id     = v_gemea.id,
      alternativa_id = null,
      resposta_texto = null,
      correta        = null
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = p_questao_id
    and tr.respondida_em is null
    and tr.enviada_em is null
  returning * into v_resposta;

  if not found then
    if exists (
      select 1 from public.tentativa_resposta tr
      where tr.tentativa_id = p_tentativa_id and tr.questao_id = p_questao_id
    ) then
      raise exception 'Questao ja respondida nesta tentativa' using errcode = 'P0014';
    end if;
    raise exception 'Resposta nao encontrada para a tentativa' using errcode = 'P0005';
  end if;

  return jsonb_build_object(
    'questao', public.montar_questao_tentativa_json(
      v_gemea.id, v_tentativa.modo, v_tentativa.prova_id, v_resposta.ordem_na_tentativa
    ),
    'resposta', row_to_json(v_resposta)::jsonb,
    'gemea', jsonb_build_object(
      'questao_id', v_gemea.id,
      'gemea_id', v_questao.id,
      'formato_atual', v_gemea.formato,
      'formato_gemea', v_questao.formato
    )
  );
end;
$$;

comment on function public.trocar_formato_questao_tentativa(uuid, uuid) is
  'Troca a questão da tentativa pela gêmea do outro formato (mesmo grupo de equivalência). Só com a questão intocada (não respondida/não enviada). Devolve a questão nova mascarada conforme o modo, a resposta atualizada e o mapa invertido da gêmea.';

revoke all on function public.trocar_formato_questao_tentativa(uuid, uuid) from public, anon;
grant execute on function public.trocar_formato_questao_tentativa(uuid, uuid) to authenticated;
