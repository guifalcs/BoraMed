-- Remove demo seeds inserted in modulo_provas_rpcs migration.
-- Faculdade is kept: it has real provas attached.

-- tentativa CASCADE deletes tentativa_resposta
DELETE FROM public.tentativa WHERE prova_id IN (
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000003'
);

-- questao CASCADE deletes alternativa and questao_tema
DELETE FROM public.questao WHERE id IN (
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000002',
  'dddddddd-0000-0000-0000-000000000003',
  'dddddddd-0000-0000-0000-000000000004',
  'dddddddd-0000-0000-0000-000000000005'
);

DELETE FROM public.prova WHERE id IN (
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000003'
);

DELETE FROM public.tema WHERE id IN (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000003'
);
