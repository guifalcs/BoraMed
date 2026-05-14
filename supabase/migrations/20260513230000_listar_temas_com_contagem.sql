CREATE OR REPLACE FUNCTION public.listar_temas_com_contagem()
RETURNS TABLE(
  id UUID,
  nome TEXT,
  disciplina TEXT,
  periodo INT,
  parent_id UUID,
  criado_em TIMESTAMPTZ,
  qtd_questoes BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT
    t.id,
    t.nome,
    t.disciplina,
    t.periodo,
    t.parent_id,
    t.criado_em,
    COUNT(q.id) AS qtd_questoes
  FROM tema t
  LEFT JOIN questao_tema qt ON qt.tema_id = t.id
  LEFT JOIN questao q ON q.id = qt.questao_id AND q.status = 'ativa'
  GROUP BY t.id, t.nome, t.disciplina, t.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$$;
