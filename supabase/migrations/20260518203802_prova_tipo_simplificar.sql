-- Simplificação do CHECK constraint de tipo em prova
-- Migration fantasma: aplicada no banco (versão 20260518203802) sem arquivo local.
-- Estado atual confirmado via consulta ao banco.

alter table public.prova
  drop constraint if exists prova_tipo_check;

alter table public.prova
  add constraint prova_tipo_check
  check (tipo in ('autoral', 'faculdade'));
