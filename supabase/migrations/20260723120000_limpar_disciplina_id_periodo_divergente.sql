-- Correção de dados: algumas provas ficaram com `disciplina_id` de um período
-- diferente do seu próprio `periodo`. Isso acontecia ao trocar o período da
-- prova no admin sem re-selecionar a matéria (o vínculo antigo permanecia). O
-- efeito visível era o filtro de matéria dos alunos vazar provas do período
-- errado (ex: filtrar "4º período" e aparecer prova do 1º).
--
-- Uma matéria pertence a um único período, então um vínculo com período
-- divergente é sempre inconsistente. Zeramos esses vínculos; o admin pode
-- re-vincular a matéria correta do período da prova.
UPDATE public.prova p
SET disciplina_id = NULL
FROM public.disciplina d
WHERE p.disciplina_id = d.id
  AND d.periodo <> p.periodo;
