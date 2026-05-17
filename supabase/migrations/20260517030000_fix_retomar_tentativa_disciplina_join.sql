-- Fix: retomar_tentativa referenciava q.disciplina e q.periodo que foram dropados
-- em 20260516154753_disciplina_table.sql. A migration 20260517001627 sobrescreveu
-- a função com a versão antiga, quebrando o retomar para todas as tentativas.
-- Combina o join via tentativa_resposta (suporte a simulado personalizado) com
-- o LEFT JOIN disciplina (schema atual).

create or replace function public.retomar_tentativa(p_tentativa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id   uuid;
  v_tentativa record;
  v_questoes  jsonb;
  v_result    jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Tentativa não encontrada ou sem permissão' using errcode = 'P0003';
  end if;

  if v_tentativa.status = 'finalizada' then
    raise exception 'Tentativa já finalizada' using errcode = 'P0005';
  end if;

  update public.tentativa
  set status = 'em_andamento',
      pausada_em = null
  where id = p_tentativa_id
  returning * into v_tentativa;

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
      'disciplina',              dq.sigla,
      'periodo',                 dq.periodo::int,
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
            'correta',    case when v_tentativa.modo = 'simulado' then null else a.correta end,
            'ordem',      a.ordem,
            'imagem_url', a.imagem_url
          ) order by a.ordem
        )
        from public.alternativa a
        where a.questao_id = q.id
      ),
      'temas', (
        select jsonb_agg(
          jsonb_build_object(
            'id',         t.id,
            'nome',       t.nome,
            'disciplina', dt.sigla,
            'periodo',    dt.periodo::int,
            'parent_id',  t.parent_id,
            'criado_em',  t.criado_em
          )
        )
        from public.questao_tema qt
        join public.tema t on t.id = qt.tema_id
        left join public.disciplina dt on dt.id = t.disciplina_id
        where qt.questao_id = q.id
      )
    )
    order by
      coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647),
      tr.id
  )
  into v_questoes
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.disciplina dq on dq.id = q.disciplina_id
  where tr.tentativa_id = p_tentativa_id
    and q.status = 'ativa';

  v_result := jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes',  coalesce(v_questoes, '[]'::jsonb)
  );

  return v_result;
end;
$function$;

revoke execute on function public.retomar_tentativa(uuid) from public;
revoke execute on function public.retomar_tentativa(uuid) from anon;
grant execute on function public.retomar_tentativa(uuid) to authenticated;
