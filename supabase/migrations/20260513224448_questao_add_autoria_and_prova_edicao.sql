
-- 1. Novos campos de autoria e metadata na questao
ALTER TABLE public.questao
  ADD COLUMN IF NOT EXISTS autor_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS revisor_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS aprovada_em timestamptz,
  ADD COLUMN IF NOT EXISTS publicada_em timestamptz,
  ADD COLUMN IF NOT EXISTS origem_geracao text NOT NULL DEFAULT 'manual'
    CHECK (origem_geracao IN ('manual', 'ia_assistida')),
  ADD COLUMN IF NOT EXISTS nivel_bloom smallint
    CHECK (nivel_bloom >= 1 AND nivel_bloom <= 6),
  ADD COLUMN IF NOT EXISTS formato_prova text
    CHECK (formato_prova IN ('N1', 'N2', 'nacional', 'P1', 'P2'));

-- 2. Atualizar constraint de status para incluir 'publicada'
ALTER TABLE public.questao DROP CONSTRAINT IF EXISTS questao_status_check;
ALTER TABLE public.questao ADD CONSTRAINT questao_status_check
  CHECK (status IN ('ativa', 'rascunho', 'arquivada', 'em_revisao', 'publicada'));

-- 3. Adicionar edicao na prova para nomes unicos
ALTER TABLE public.prova
  ADD COLUMN IF NOT EXISTS edicao integer NOT NULL DEFAULT 1;

-- 4. Tornar faculdade_id nullable (simulados originais nao precisam de faculdade)
ALTER TABLE public.prova ALTER COLUMN faculdade_id DROP NOT NULL;

-- 5. Unique constraint: formato + periodo + edicao garante unicidade
CREATE UNIQUE INDEX IF NOT EXISTS prova_tipo_periodo_edicao_unique
  ON public.prova (tipo, periodo, edicao)
  WHERE tipo IS NOT NULL AND periodo IS NOT NULL;

-- 6. Indices para os novos campos de autoria
CREATE INDEX IF NOT EXISTS idx_questao_autor ON public.questao(autor_id);
CREATE INDEX IF NOT EXISTS idx_questao_revisor ON public.questao(revisor_id);
CREATE INDEX IF NOT EXISTS idx_questao_formato_prova ON public.questao(formato_prova);
CREATE INDEX IF NOT EXISTS idx_questao_status ON public.questao(status);
;
