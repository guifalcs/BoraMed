ALTER TABLE public.questao ADD COLUMN IF NOT EXISTS explicacao_original text;
UPDATE public.questao SET explicacao_original = explicacao WHERE explicacao_original IS NULL;
