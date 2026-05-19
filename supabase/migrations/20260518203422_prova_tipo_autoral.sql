-- Adicionar tipo 'autoral' para provas criadas pela equipe BoraMed
-- sem vínculo obrigatório com faculdade, ano ou semestre

ALTER TABLE public.prova
  DROP CONSTRAINT IF EXISTS prova_tipo_check;

ALTER TABLE public.prova
  ADD CONSTRAINT prova_tipo_check
  CHECK (tipo IN ('nacional', 'processual', 'multiestacoes', 'autoral'));
