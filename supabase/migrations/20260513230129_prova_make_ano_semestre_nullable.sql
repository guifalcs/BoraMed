
-- ano e semestre não fazem sentido para simulados originais
ALTER TABLE public.prova ALTER COLUMN ano DROP NOT NULL;
ALTER TABLE public.prova ALTER COLUMN semestre DROP NOT NULL;
;
