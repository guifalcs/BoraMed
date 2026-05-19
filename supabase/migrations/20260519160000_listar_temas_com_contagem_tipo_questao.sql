-- Adiciona parâmetro opcional p_tipo_questao a listar_temas_com_contagem.
-- Quando informado, conta apenas questões do tipo especificado (geral | laboratorio).
-- Sem o parâmetro, comportamento legado é preservado (conta todos os tipos).

DROP FUNCTION IF EXISTS public.listar_temas_com_contagem();

CREATE OR REPLACE FUNCTION public.listar_temas_com_contagem(
  p_tipo_questao text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  nome text,
  disciplina_id uuid,
  disciplina text,
  periodo integer,
  parent_id uuid,
  criado_em timestamp with time zone,
  qtd_questoes bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  GROUP BY t.id, t.nome, t.disciplina_id, dq.sigla, dq.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$function$;
