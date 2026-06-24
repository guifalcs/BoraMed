-- Questões do tipo "laboratorio" não devem ser obrigadas a ter imagem.
-- A constraint exigia imagem_url para tipo_questao = 'laboratorio', o que
-- bloqueava a importação de questões teóricas marcadas como laboratório.
ALTER TABLE public.questao
  DROP CONSTRAINT IF EXISTS questao_laboratorio_imagem_check;
