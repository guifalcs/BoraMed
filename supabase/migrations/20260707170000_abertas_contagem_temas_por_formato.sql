-- ============================================================================
-- Questões abertas — corrige inconsistência entre a contagem de temas e o
-- gerador de simulado personalizado.
--
-- `gerar_simulado_personalizado` filtra por `p_formato_questao`
-- (fechadas/discursivas/misto), mas `listar_temas_com_contagem` contava todas
-- as questões ativas do tipo — então um tema só com questões fechadas exibia
-- "1 questão" e o gerador de discursivas encontrava 0 (contradição na UI).
--
-- Adiciona `p_formato_questao` (default NULL = comportamento anterior, conta
-- tudo) espelhando exatamente o filtro do gerador.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

-- Remove a versão de 1 argumento: com o parâmetro novo (default), manter as
-- duas criaria overload ambíguo ao chamar com um só argumento.
drop function if exists public.listar_temas_com_contagem(text);

create or replace function public.listar_temas_com_contagem(
  p_tipo_questao text default null,
  p_formato_questao text default null
)
returns table(
  id uuid, nome text, disciplina_id uuid, disciplina text, periodo integer,
  parent_id uuid, criado_em timestamp with time zone, qtd_questoes bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  SELECT
    t.id,
    t.nome,
    t.disciplina_id,
    dq.sigla   AS disciplina,
    dq.periodo::int AS periodo,
    t.parent_id,
    t.criado_em,
    COUNT(q.id) AS qtd_questoes
  FROM tema t
  LEFT JOIN disciplina dq ON dq.id = t.disciplina_id
  LEFT JOIN questao_tema qt ON qt.tema_id = t.id
  LEFT JOIN questao q
    ON  q.id = qt.questao_id
    AND q.status = 'ativa'
    AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
    -- Espelha o filtro de formato do gerar_simulado_personalizado
    AND (
      p_formato_questao IS NULL
      OR (p_formato_questao = 'fechadas' AND q.formato <> 'resposta_aberta_curta')
      OR (p_formato_questao = 'discursivas' AND q.formato = 'resposta_aberta_curta')
      OR p_formato_questao = 'misto'
    )
  WHERE (
    p_tipo_questao IS NULL
    OR t.tipos_prova IS NULL
    OR p_tipo_questao = ANY(t.tipos_prova)
  )
  GROUP BY t.id, t.nome, t.disciplina_id, dq.sigla, dq.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$$;
