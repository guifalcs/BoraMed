-- Correção de dados: toda questão vinculada a uma prova nacional deve ter
-- tipo_questao = 'nacional'.
--
-- Contexto: questões importadas a partir de provas nacionais que possuíam
-- imagem acabaram classificadas como 'laboratorio' (a heurística de importação
-- associa imagem de lâmina/peça ao tipo laboratório — ver business-rules.md:37,
-- "questões de laboratório SEMPRE têm imagem_url"). Isso está incorreto: o
-- vínculo com a prova (prova.formato = 'nacional') é a fonte da verdade para a
-- classificação, independentemente da questão ter ou não imagem.
--
-- Esta migration reclassifica como 'nacional' toda questão cuja prova associada
-- tem formato = 'nacional' e que ainda não está marcada como 'nacional'
-- (cobre tanto 'laboratorio' quanto 'processual' mal classificados). É
-- idempotente: rodar novamente não afeta linhas já corrigidas.

UPDATE public.questao AS q
SET
  tipo_questao = 'nacional',
  atualizado_em = NOW()
FROM public.prova AS p
WHERE q.prova_id = p.id
  AND p.formato = 'nacional'
  AND q.tipo_questao IS DISTINCT FROM 'nacional';
