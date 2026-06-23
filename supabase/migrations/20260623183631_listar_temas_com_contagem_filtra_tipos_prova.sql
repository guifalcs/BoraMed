-- Filtra os temas retornados por tipo de prova (coluna tema.tipos_prova).
-- Quando p_tipo_questao é informado, exclui temas restritos a outros tipos:
--   tipos_prova IS NULL  -> tema vale para todas as provas (sempre aparece)
--   p_tipo_questao = ANY(tipos_prova) -> tema aplicável ao tipo solicitado
-- Quando p_tipo_questao IS NULL (formato "todos"), retorna todos os temas.
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
  WHERE (
    p_tipo_questao IS NULL
    OR t.tipos_prova IS NULL
    OR p_tipo_questao = ANY(t.tipos_prova)
  )
  GROUP BY t.id, t.nome, t.disciplina_id, dq.sigla, dq.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$function$;
