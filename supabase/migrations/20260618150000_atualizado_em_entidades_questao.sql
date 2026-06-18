-- atualizado_em nas entidades do domínio de questões.
--
-- Adiciona a coluna atualizado_em (timestamptz, default now()) e o trigger
-- BEFORE UPDATE que a mantém em dia, seguindo o padrão já usado em questao:
-- trigger <tabela>_atualizado_em_trigger -> public.update_atualizado_em().
--
-- Entidades: disciplina, tema, prova (já possuem criado_em) e alternativa
-- (ganha criado_em + atualizado_em, pois não tinha nenhum).
--
-- Para as linhas existentes, atualizado_em recebe o valor de criado_em
-- (reflete a realidade em vez do instante da migration).

-- disciplina
alter table public.disciplina add column atualizado_em timestamptz;
update public.disciplina set atualizado_em = criado_em where atualizado_em is null;
alter table public.disciplina alter column atualizado_em set default now();
alter table public.disciplina alter column atualizado_em set not null;
create trigger disciplina_atualizado_em_trigger
  before update on public.disciplina
  for each row execute function public.update_atualizado_em();

-- tema
alter table public.tema add column atualizado_em timestamptz;
update public.tema set atualizado_em = criado_em where atualizado_em is null;
alter table public.tema alter column atualizado_em set default now();
alter table public.tema alter column atualizado_em set not null;
create trigger tema_atualizado_em_trigger
  before update on public.tema
  for each row execute function public.update_atualizado_em();

-- prova
alter table public.prova add column atualizado_em timestamptz;
update public.prova set atualizado_em = criado_em where atualizado_em is null;
alter table public.prova alter column atualizado_em set default now();
alter table public.prova alter column atualizado_em set not null;
create trigger prova_atualizado_em_trigger
  before update on public.prova
  for each row execute function public.update_atualizado_em();

-- alternativa (não possuía timestamps)
alter table public.alternativa add column criado_em timestamptz not null default now();
alter table public.alternativa add column atualizado_em timestamptz not null default now();
create trigger alternativa_atualizado_em_trigger
  before update on public.alternativa
  for each row execute function public.update_atualizado_em();
