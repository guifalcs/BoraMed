-- Exclusao de entidades academicas (prova, questao, disciplina, tema)
-- preservando o historico do aluno:
-- - prova: delete fisico; tentativas mantidas com snapshot (nome/tipo/formato)
-- - questao: delete fisico quando nunca usada; soft delete (status 'deletada')
--   quando ha respostas de tentativa ou desafio diario, mantendo a revisao intacta
-- - disciplina: delete fisico; questoes/temas ficam sem disciplina (SET NULL)
-- - tema: delete fisico; subtemas sobem para o pai do tema removido

-- ---------------------------------------------------------------------------
-- 1. tentativa: prova_id nullable + snapshot da prova deletada
-- ---------------------------------------------------------------------------

alter table public.tentativa
  add column if not exists prova_snapshot jsonb;

alter table public.tentativa
  alter column prova_id drop not null;

alter table public.tentativa
  drop constraint if exists tentativa_prova_id_fkey;
alter table public.tentativa
  add constraint tentativa_prova_id_fkey
  foreign key (prova_id) references public.prova(id)
  on delete set null not valid;
alter table public.tentativa validate constraint tentativa_prova_id_fkey;

-- Antes de deletar uma prova, grava snapshot nas tentativas vinculadas para o
-- historico do aluno continuar exibindo nome/tipo. Cobre qualquer caminho de
-- delete (RPC, SQL direto), nao apenas o fluxo do admin.
create or replace function public.snapshot_prova_em_tentativas()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.tentativa
  set prova_snapshot = jsonb_build_object(
    'nome', old.nome,
    'tipo', old.tipo,
    'origem', old.origem,
    'formato', old.formato,
    'deletada_em', now()
  )
  where prova_id = old.id;
  return old;
end;
$$;

drop trigger if exists prova_snapshot_antes_delete on public.prova;
create trigger prova_snapshot_antes_delete
  before delete on public.prova
  for each row execute function public.snapshot_prova_em_tentativas();

-- ---------------------------------------------------------------------------
-- 2. questao: status 'deletada' (soft delete quando ha historico de aluno)
-- ---------------------------------------------------------------------------

alter table public.questao drop constraint if exists questao_status_check;
alter table public.questao add constraint questao_status_check
  check (status in ('ativa', 'rascunho', 'arquivada', 'em_revisao', 'publicada', 'deletada'));

-- ---------------------------------------------------------------------------
-- 3. FKs: trocar RESTRICT por comportamento que permite a exclusao
-- ---------------------------------------------------------------------------

-- delete fisico de questao remove o vinculo com provas
alter table public.prova_questao
  drop constraint if exists prova_questao_questao_id_fkey;
alter table public.prova_questao
  add constraint prova_questao_questao_id_fkey
  foreign key (questao_id) references public.questao(id)
  on delete cascade not valid;
alter table public.prova_questao validate constraint prova_questao_questao_id_fkey;

-- delete de tema remove a marcacao nas questoes
alter table public.questao_tema
  drop constraint if exists questao_tema_tema_id_fkey;
alter table public.questao_tema
  add constraint questao_tema_tema_id_fkey
  foreign key (tema_id) references public.tema(id)
  on delete cascade not valid;
alter table public.questao_tema validate constraint questao_tema_tema_id_fkey;

-- rede de seguranca: subtemas viram raiz se o pai sumir fora da RPC
alter table public.tema
  drop constraint if exists tema_parent_id_fkey;
alter table public.tema
  add constraint tema_parent_id_fkey
  foreign key (parent_id) references public.tema(id)
  on delete set null not valid;
alter table public.tema validate constraint tema_parent_id_fkey;

-- delete de disciplina desvincula questoes e temas
alter table public.questao
  drop constraint if exists questao_disciplina_id_fkey;
alter table public.questao
  add constraint questao_disciplina_id_fkey
  foreign key (disciplina_id) references public.disciplina(id)
  on delete set null not valid;
alter table public.questao validate constraint questao_disciplina_id_fkey;

alter table public.tema
  drop constraint if exists tema_disciplina_id_fkey;
alter table public.tema
  add constraint tema_disciplina_id_fkey
  foreign key (disciplina_id) references public.disciplina(id)
  on delete set null not valid;
alter table public.tema validate constraint tema_disciplina_id_fkey;

-- ---------------------------------------------------------------------------
-- 4. RPCs de exclusao (admin)
-- ---------------------------------------------------------------------------

set check_function_bodies = off;

create or replace function public.admin_deletar_prova(p_prova_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tentativas integer;
begin
  if not public.is_admin() then
    raise exception 'permission_denied: apenas administradores podem deletar provas' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.prova where id = p_prova_id) then
    raise exception 'Prova nao encontrada' using errcode = 'P0003';
  end if;

  select count(*) into v_tentativas
  from public.tentativa
  where prova_id = p_prova_id;

  -- trigger grava o snapshot nas tentativas; FKs cuidam de prova_questao
  -- (cascade) e tentativa.prova_id / questao.prova_id (set null)
  delete from public.prova where id = p_prova_id;

  return jsonb_build_object('tentativas_preservadas', v_tentativas);
end;
$$;

create or replace function public.admin_deletar_questao(p_questao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_respostas integer;
  v_desafios integer;
  v_provas uuid[];
  v_modo text;
begin
  if not public.is_admin() then
    raise exception 'permission_denied: apenas administradores podem deletar questoes' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.questao where id = p_questao_id and status <> 'deletada') then
    raise exception 'Questao nao encontrada' using errcode = 'P0003';
  end if;

  select count(*) into v_respostas
  from public.tentativa_resposta
  where questao_id = p_questao_id;

  select count(*) into v_desafios
  from public.desafio_diario
  where questao_id = p_questao_id;

  select array_agg(distinct prova_id) into v_provas
  from public.prova_questao
  where questao_id = p_questao_id;

  if v_respostas > 0 or v_desafios > 0 then
    -- soft delete: o conteudo segue disponivel para revisao de tentativas e
    -- historico de desafios, mas sai do banco de questoes e de novos sorteios
    update public.questao
    set status = 'deletada',
        apto_desafio_diario = false
    where id = p_questao_id;

    delete from public.prova_questao where questao_id = p_questao_id;
    v_modo := 'soft';
  else
    -- nunca usada por aluno: delete fisico (cascade em alternativa,
    -- questao_tema e prova_questao)
    delete from public.questao where id = p_questao_id;
    v_modo := 'hard';
  end if;

  if v_provas is not null then
    update public.prova p
    set qtd_questoes = (
      select count(*) from public.prova_questao pq where pq.prova_id = p.id
    )
    where p.id = any(v_provas);
  end if;

  return jsonb_build_object(
    'modo', v_modo,
    'respostas_preservadas', v_respostas,
    'provas_afetadas', coalesce(array_length(v_provas, 1), 0)
  );
end;
$$;

create or replace function public.admin_deletar_disciplina(p_disciplina_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_questoes integer;
  v_temas integer;
begin
  if not public.is_admin() then
    raise exception 'permission_denied: apenas administradores podem deletar disciplinas' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.disciplina where id = p_disciplina_id) then
    raise exception 'Disciplina nao encontrada' using errcode = 'P0003';
  end if;

  select count(*) into v_questoes from public.questao where disciplina_id = p_disciplina_id;
  select count(*) into v_temas from public.tema where disciplina_id = p_disciplina_id;

  -- FKs SET NULL desvinculam questoes e temas sem apagar conteudo
  delete from public.disciplina where id = p_disciplina_id;

  return jsonb_build_object(
    'questoes_desvinculadas', v_questoes,
    'temas_desvinculados', v_temas
  );
end;
$$;

create or replace function public.admin_deletar_tema(p_tema_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tema record;
  v_questoes integer;
  v_subtemas integer;
begin
  if not public.is_admin() then
    raise exception 'permission_denied: apenas administradores podem deletar temas' using errcode = 'P0001';
  end if;

  select * into v_tema from public.tema where id = p_tema_id;
  if not found then
    raise exception 'Tema nao encontrado' using errcode = 'P0003';
  end if;

  select count(*) into v_questoes from public.questao_tema where tema_id = p_tema_id;

  -- subtemas sobem para o pai do tema removido (raiz se nao houver pai)
  update public.tema
  set parent_id = v_tema.parent_id
  where parent_id = p_tema_id;
  get diagnostics v_subtemas = row_count;

  -- questao_tema cai por cascade
  delete from public.tema where id = p_tema_id;

  return jsonb_build_object(
    'questoes_desvinculadas', v_questoes,
    'subtemas_realocados', v_subtemas
  );
end;
$$;

revoke execute on function public.admin_deletar_prova(uuid) from public;
revoke execute on function public.admin_deletar_questao(uuid) from public;
revoke execute on function public.admin_deletar_disciplina(uuid) from public;
revoke execute on function public.admin_deletar_tema(uuid) from public;

revoke execute on function public.admin_deletar_prova(uuid) from anon;
revoke execute on function public.admin_deletar_questao(uuid) from anon;
revoke execute on function public.admin_deletar_disciplina(uuid) from anon;
revoke execute on function public.admin_deletar_tema(uuid) from anon;

grant execute on function public.admin_deletar_prova(uuid) to authenticated;
grant execute on function public.admin_deletar_questao(uuid) to authenticated;
grant execute on function public.admin_deletar_disciplina(uuid) to authenticated;
grant execute on function public.admin_deletar_tema(uuid) to authenticated;
