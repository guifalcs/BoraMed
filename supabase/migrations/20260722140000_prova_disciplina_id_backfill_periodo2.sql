-- Backfill: provas do período 2 já têm a matéria no nome (ex: "N1 SOI II
-- 2025.1", "N2 MCM II 2025.2"). Integradoras não pertencem a uma matéria
-- específica e ficam de fora. Continuação de 20260722120000 (período 1),
-- agora que as matérias do período 2 foram cadastradas.
UPDATE public.prova p
SET disciplina_id = d.id
FROM public.disciplina d
WHERE p.periodo = 2
  AND coalesce(p.subtipo, '') <> 'integradora'
  AND p.disciplina_id IS NULL
  AND d.periodo = 2
  AND (
    (d.sigla = 'HAM II' AND p.nome ~* '\yHAM\y') OR
    (d.sigla = 'IESC II' AND p.nome ~* '\yIESC\y') OR
    (d.sigla = 'MCM II' AND p.nome ~* '\yMCM\y') OR
    (d.sigla = 'SOI II' AND p.nome ~* '\ySOI\y')
  );
