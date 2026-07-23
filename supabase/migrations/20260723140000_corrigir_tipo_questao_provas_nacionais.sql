-- Correção de dados: toda questão vinculada a uma prova nacional deve ter
-- tipo_questao = 'nacional'.
--
-- Contexto: questões que aparecem em provas nacionais foram importadas com
-- classificação divergente. As com imagem acabaram como 'laboratorio' (a
-- heurística de importação associa imagem de lâmina/peça ao tipo laboratório —
-- ver business-rules.md:37, "questões de laboratório SEMPRE têm imagem_url");
-- outras ficaram como 'processual'. O vínculo com a prova é a fonte da verdade
-- para a classificação, independentemente de a questão ter imagem.
--
-- Observação: o vínculo questão↔prova é N:N pela tabela `prova_questao`
-- (a coluna questao.prova_id não é usada). A correção só afeta questões que
-- estão exclusivamente em provas nacionais — foi verificado que nenhuma das
-- questões alvo pertence também a uma prova de formato não-nacional.
--
-- Idempotente: rodar novamente não afeta linhas já corrigidas.

UPDATE public.questao AS q
SET
  tipo_questao = 'nacional',
  atualizado_em = NOW()
WHERE q.tipo_questao IS DISTINCT FROM 'nacional'
  AND EXISTS (
    SELECT 1
    FROM public.prova_questao pq
    JOIN public.prova p ON p.id = pq.prova_id
    WHERE pq.questao_id = q.id
      AND p.formato = 'nacional'
  );
