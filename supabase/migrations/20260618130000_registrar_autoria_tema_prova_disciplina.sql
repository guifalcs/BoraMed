-- Registrar o usuário que criou cada entidade do admin.
-- questao já possui autor_id; aqui adicionamos criado_por para tema, prova e disciplina.
-- DEFAULT auth.uid() garante o registro automático em qualquer insert do admin autenticado,
-- sem depender do frontend.

-- 1. Coluna de autoria (criado_por) nas tabelas que ainda não rastreavam o criador
ALTER TABLE public.tema
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

ALTER TABLE public.prova
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

ALTER TABLE public.disciplina
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

ALTER TABLE public.avisos
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

ALTER TABLE public.faculdade
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

-- 2. Backstop para questao: além do autor_id setado pelo frontend, captura auth.uid() por padrão
ALTER TABLE public.questao
  ALTER COLUMN autor_id SET DEFAULT auth.uid();

-- 3. Índices para os novos campos de autoria
CREATE INDEX IF NOT EXISTS idx_tema_criado_por ON public.tema(criado_por);
CREATE INDEX IF NOT EXISTS idx_prova_criado_por ON public.prova(criado_por);
CREATE INDEX IF NOT EXISTS idx_disciplina_criado_por ON public.disciplina(criado_por);
CREATE INDEX IF NOT EXISTS idx_avisos_criado_por ON public.avisos(criado_por);
CREATE INDEX IF NOT EXISTS idx_faculdade_criado_por ON public.faculdade(criado_por);
