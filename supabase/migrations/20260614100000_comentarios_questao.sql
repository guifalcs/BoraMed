-- Comentarios publicos por questao.
-- Compartilhados entre todos os alunos, atrelados a questao_id (nao a tentativa).
-- Suporta replies de 1 nivel, likes/dislikes, blocklist server-side e denuncias.

-- Extensao para normalizar texto na blocklist (remove acentos)
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- palavra_proibida — blocklist gerenciada por admins, consultada server-side
-- ---------------------------------------------------------------------------
create table public.palavra_proibida (
  id uuid primary key default gen_random_uuid(),
  termo text not null unique,
  criado_em timestamptz not null default now()
);

alter table public.palavra_proibida enable row level security;

-- Nenhum acesso direto por usuarios autenticados; leitura via helper SECURITY DEFINER
revoke all on table public.palavra_proibida from anon;
revoke all on table public.palavra_proibida from authenticated;
grant all on table public.palavra_proibida to service_role;

-- Seed inicial da blocklist (pt-BR)
insert into public.palavra_proibida (termo) values
  ('porra'), ('merda'), ('caralho'), ('buceta'), ('puta'), ('viado'),
  ('fdp'), ('filho da puta'), ('idiota'), ('imbecil'), ('cuzao'),
  ('vsfd'), ('vsf'), ('kct'), ('krl');

-- ---------------------------------------------------------------------------
-- questao_comentario — tabela principal de comentarios
-- ---------------------------------------------------------------------------
create table public.questao_comentario (
  id uuid primary key default gen_random_uuid(),
  questao_id uuid not null references public.questao(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.questao_comentario(id) on delete set null,
  conteudo text not null,
  status text not null default 'ativo',
  editado boolean not null default false,
  likes integer not null default 0,
  dislikes integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint questao_comentario_conteudo_check
    check (char_length(btrim(conteudo)) between 1 and 2000),
  constraint questao_comentario_status_check
    check (status in ('ativo', 'removido'))
);

create index idx_questao_comentario_questao_id
  on public.questao_comentario (questao_id);

create index idx_questao_comentario_parent_id
  on public.questao_comentario (parent_id);

create index idx_questao_comentario_user_id
  on public.questao_comentario (user_id);

create index idx_questao_comentario_questao_status_criado
  on public.questao_comentario (questao_id, status, criado_em);

-- Trigger atualizado_em
create trigger questao_comentario_atualizado_em_trigger
  before update on public.questao_comentario
  for each row execute function public.update_atualizado_em();

-- Trigger: garante maximo 1 nivel de replies e mesma questao
create or replace function public.trg_fn_comentario_validar_parent()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.questao_comentario p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Respostas nao podem ter sub-respostas' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.questao_comentario p
      where p.id = new.parent_id and p.questao_id = new.questao_id
    ) then
      raise exception 'Resposta deve pertencer a mesma questao' using errcode = 'P0003';
    end if;
  end if;
  return new;
end;
$$;

create trigger questao_comentario_validar_parent_trigger
  before insert on public.questao_comentario
  for each row execute function public.trg_fn_comentario_validar_parent();

alter table public.questao_comentario enable row level security;

revoke all on table public.questao_comentario from anon;
grant select, insert, update, delete on table public.questao_comentario to authenticated;
grant all on table public.questao_comentario to service_role;

create policy questao_comentario_select
  on public.questao_comentario
  for select
  to authenticated
  using (
    status = 'ativo'
    or user_id = (select auth.uid())
    or public.is_admin()
  );

create policy questao_comentario_insert
  on public.questao_comentario
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy questao_comentario_update
  on public.questao_comentario
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy questao_comentario_delete
  on public.questao_comentario
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- questao_comentario_voto — likes e dislikes
-- ---------------------------------------------------------------------------
create table public.questao_comentario_voto (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references public.questao_comentario(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  valor smallint not null,
  criado_em timestamptz not null default now(),
  constraint questao_comentario_voto_valor_check check (valor in (-1, 1)),
  constraint questao_comentario_voto_unique unique (comentario_id, user_id)
);

create index idx_questao_comentario_voto_comentario
  on public.questao_comentario_voto (comentario_id);

create index idx_questao_comentario_voto_user
  on public.questao_comentario_voto (user_id);

-- Trigger: recalcula likes/dislikes no comentario pai
create or replace function public.trg_fn_comentario_voto_recalcular()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_comentario_id uuid;
begin
  v_comentario_id := coalesce(new.comentario_id, old.comentario_id);
  update public.questao_comentario set
    likes = (
      select count(*) from public.questao_comentario_voto
      where comentario_id = v_comentario_id and valor = 1
    ),
    dislikes = (
      select count(*) from public.questao_comentario_voto
      where comentario_id = v_comentario_id and valor = -1
    )
  where id = v_comentario_id;
  return null;
end;
$$;

create trigger questao_comentario_voto_recalcular_trigger
  after insert or update or delete on public.questao_comentario_voto
  for each row execute function public.trg_fn_comentario_voto_recalcular();

alter table public.questao_comentario_voto enable row level security;

revoke all on table public.questao_comentario_voto from anon;
grant select, insert, update, delete on table public.questao_comentario_voto to authenticated;
grant all on table public.questao_comentario_voto to service_role;

create policy questao_comentario_voto_select
  on public.questao_comentario_voto
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy questao_comentario_voto_insert
  on public.questao_comentario_voto
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy questao_comentario_voto_update
  on public.questao_comentario_voto
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy questao_comentario_voto_delete
  on public.questao_comentario_voto
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- questao_comentario_denuncia — denuncias para revisao admin
-- ---------------------------------------------------------------------------
create table public.questao_comentario_denuncia (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references public.questao_comentario(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  motivo text,
  criado_em timestamptz not null default now(),
  constraint questao_comentario_denuncia_motivo_check
    check (motivo is null or char_length(btrim(motivo)) <= 500),
  constraint questao_comentario_denuncia_unique
    unique (comentario_id, user_id)
);

create index idx_questao_comentario_denuncia_comentario
  on public.questao_comentario_denuncia (comentario_id);

create index idx_questao_comentario_denuncia_user_id
  on public.questao_comentario_denuncia (user_id);

alter table public.questao_comentario_denuncia enable row level security;

revoke all on table public.questao_comentario_denuncia from anon;
grant insert on table public.questao_comentario_denuncia to authenticated;
grant all on table public.questao_comentario_denuncia to service_role;

create policy questao_comentario_denuncia_insert
  on public.questao_comentario_denuncia
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy questao_comentario_denuncia_select_admin
  on public.questao_comentario_denuncia
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helper: detectar palavra proibida
-- ---------------------------------------------------------------------------
create or replace function public.contem_palavra_proibida(p_texto text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_texto_norm text;
  v_termo text;
  v_termo_norm text;
begin
  v_texto_norm := lower(extensions.unaccent(p_texto));
  for v_termo in select termo from public.palavra_proibida loop
    v_termo_norm := lower(extensions.unaccent(v_termo));
    -- \m = word start boundary, \M = word end boundary (PostgreSQL ARE syntax)
    if v_texto_norm ~ ('\m' || v_termo_norm || '\M') then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

revoke execute on function public.contem_palavra_proibida(text) from public;
revoke execute on function public.contem_palavra_proibida(text) from anon;
grant execute on function public.contem_palavra_proibida(text) to authenticated;

-- Revoga acesso de anon/public às funcoes internas de trigger
revoke execute on function public.trg_fn_comentario_validar_parent() from public;
revoke execute on function public.trg_fn_comentario_validar_parent() from anon;
revoke execute on function public.trg_fn_comentario_voto_recalcular() from public;
revoke execute on function public.trg_fn_comentario_voto_recalcular() from anon;

-- ---------------------------------------------------------------------------
-- RPC: listar_comentarios_questao
-- ---------------------------------------------------------------------------
create or replace function public.listar_comentarios_questao(
  p_questao_id uuid,
  p_ordenacao text default 'relevante'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_total integer;
  v_result jsonb;
begin
  -- Total de raizes ativas (para o contador no accordion)
  select count(*) into v_total
  from public.questao_comentario
  where questao_id = p_questao_id
    and parent_id is null
    and status = 'ativo';

  with raizes as (
    select
      qc.id,
      qc.parent_id,
      qc.user_id as autor_id,
      case when qc.status = 'removido' then null else qc.conteudo end as conteudo,
      qc.status,
      qc.editado,
      qc.likes,
      qc.dislikes,
      qc.criado_em,
      (qc.user_id = v_user_id) as is_me,
      case when coalesce(p.competir_publico, true)
        then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
        else 'Anônimo'
      end as nome_display,
      case when coalesce(p.competir_publico, true)
        then p.avatar_url else null
      end as avatar_url,
      case
        when coalesce(p.competir_publico, true) then qc.user_id
        when qc.user_id = v_user_id then qc.user_id
        else null
      end as user_id_display,
      coalesce((
        select v.valor from public.questao_comentario_voto v
        where v.comentario_id = qc.id and v.user_id = v_user_id
      ), 0) as meu_voto
    from public.questao_comentario qc
    left join public.profiles p on p.id = qc.user_id
    where qc.questao_id = p_questao_id
      and qc.parent_id is null
      and (
        qc.status = 'ativo'
        or exists (
          select 1 from public.questao_comentario r
          where r.parent_id = qc.id and r.status = 'ativo'
        )
      )
  ),
  respostas_por_raiz as (
    select
      qr.parent_id,
      jsonb_agg(
        jsonb_build_object(
          'id', qr.id,
          'parent_id', qr.parent_id,
          'conteudo', case when qr.status = 'removido' then null else qr.conteudo end,
          'status', qr.status,
          'editado', qr.editado,
          'nome_display', case when coalesce(pr.competir_publico, true)
            then coalesce(nullif(pr.nome_completo, ''), split_part(pr.email, '@', 1), 'Aluno')
            else 'Anônimo' end,
          'avatar_url', case when coalesce(pr.competir_publico, true) then pr.avatar_url else null end,
          'user_id', case
            when coalesce(pr.competir_publico, true) then qr.user_id
            when qr.user_id = v_user_id then qr.user_id
            else null end,
          'is_me', (qr.user_id = v_user_id),
          'likes', qr.likes,
          'dislikes', qr.dislikes,
          'meu_voto', coalesce((
            select v.valor from public.questao_comentario_voto v
            where v.comentario_id = qr.id and v.user_id = v_user_id
          ), 0),
          'criado_em', qr.criado_em,
          'respostas', '[]'::jsonb
        )
        order by qr.criado_em asc
      ) as respostas
    from public.questao_comentario qr
    left join public.profiles pr on pr.id = qr.user_id
    where qr.parent_id in (select id from raizes)
      and qr.status = 'ativo'
    group by qr.parent_id
  )
  select jsonb_build_object(
    'comentarios', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'parent_id', r.parent_id,
          'conteudo', r.conteudo,
          'status', r.status,
          'editado', r.editado,
          'nome_display', r.nome_display,
          'avatar_url', r.avatar_url,
          'user_id', r.user_id_display,
          'is_me', r.is_me,
          'likes', r.likes,
          'dislikes', r.dislikes,
          'meu_voto', r.meu_voto,
          'criado_em', r.criado_em,
          'respostas', coalesce(rpr.respostas, '[]'::jsonb)
        )
        order by
          -- Ordenacao dinamica: negar para simular DESC
          case when p_ordenacao = 'relevante'
            then -(r.likes - r.dislikes) else 0
          end asc,
          case when p_ordenacao = 'antigo'
            then extract(epoch from r.criado_em)
            else -extract(epoch from r.criado_em)
          end asc
      )
      from raizes r
      left join respostas_por_raiz rpr on rpr.parent_id = r.id
    ), '[]'::jsonb),
    'total', v_total
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.listar_comentarios_questao(uuid, text) from public;
revoke execute on function public.listar_comentarios_questao(uuid, text) from anon;
grant execute on function public.listar_comentarios_questao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: criar_comentario_questao
-- ---------------------------------------------------------------------------
create or replace function public.criar_comentario_questao(
  p_questao_id uuid,
  p_conteudo text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_conteudo text := btrim(coalesce(p_conteudo, ''));
  v_novo public.questao_comentario;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if v_conteudo = '' then
    raise exception 'Conteudo nao pode ser vazio' using errcode = 'P0004';
  end if;

  if char_length(v_conteudo) > 2000 then
    raise exception 'Conteudo muito longo (maximo 2000 caracteres)' using errcode = 'P0005';
  end if;

  if public.contem_palavra_proibida(v_conteudo) then
    raise exception 'Comentario contem linguagem inapropriada' using errcode = 'P0010';
  end if;

  if p_parent_id is not null then
    if not exists (
      select 1 from public.questao_comentario p
      where p.id = p_parent_id
        and p.questao_id = p_questao_id
        and p.parent_id is null
        and p.status = 'ativo'
    ) then
      raise exception 'Comentario pai invalido ou nao encontrado' using errcode = 'P0006';
    end if;
  end if;

  insert into public.questao_comentario (questao_id, user_id, parent_id, conteudo)
  values (p_questao_id, v_user_id, p_parent_id, v_conteudo)
  returning * into v_novo;

  select * into v_profile from public.profiles where id = v_user_id;

  return jsonb_build_object(
    'id', v_novo.id,
    'parent_id', v_novo.parent_id,
    'conteudo', v_novo.conteudo,
    'status', v_novo.status,
    'editado', v_novo.editado,
    'nome_display', case when coalesce(v_profile.competir_publico, true)
      then coalesce(nullif(v_profile.nome_completo, ''), split_part(v_profile.email, '@', 1), 'Aluno')
      else 'Anônimo' end,
    'avatar_url', case when coalesce(v_profile.competir_publico, true)
      then v_profile.avatar_url else null end,
    'user_id', v_user_id,
    'is_me', true,
    'likes', 0,
    'dislikes', 0,
    'meu_voto', 0,
    'criado_em', v_novo.criado_em,
    'respostas', '[]'::jsonb
  );
end;
$$;

revoke execute on function public.criar_comentario_questao(uuid, text, uuid) from public;
revoke execute on function public.criar_comentario_questao(uuid, text, uuid) from anon;
grant execute on function public.criar_comentario_questao(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: editar_comentario_questao
-- ---------------------------------------------------------------------------
create or replace function public.editar_comentario_questao(
  p_comentario_id uuid,
  p_conteudo text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_conteudo text := btrim(coalesce(p_conteudo, ''));
  v_comentario public.questao_comentario;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if v_conteudo = '' then
    raise exception 'Conteudo nao pode ser vazio' using errcode = 'P0004';
  end if;

  if char_length(v_conteudo) > 2000 then
    raise exception 'Conteudo muito longo (maximo 2000 caracteres)' using errcode = 'P0005';
  end if;

  if public.contem_palavra_proibida(v_conteudo) then
    raise exception 'Comentario contem linguagem inapropriada' using errcode = 'P0010';
  end if;

  select * into v_comentario
  from public.questao_comentario
  where id = p_comentario_id
    and user_id = v_user_id
    and status = 'ativo';

  if not found then
    raise exception 'Comentario nao encontrado ou sem permissao' using errcode = 'P0007';
  end if;

  update public.questao_comentario
  set conteudo = v_conteudo, editado = true
  where id = p_comentario_id
  returning * into v_comentario;

  select * into v_profile from public.profiles where id = v_user_id;

  return jsonb_build_object(
    'id', v_comentario.id,
    'parent_id', v_comentario.parent_id,
    'conteudo', v_comentario.conteudo,
    'status', v_comentario.status,
    'editado', v_comentario.editado,
    'nome_display', case when coalesce(v_profile.competir_publico, true)
      then coalesce(nullif(v_profile.nome_completo, ''), split_part(v_profile.email, '@', 1), 'Aluno')
      else 'Anônimo' end,
    'avatar_url', case when coalesce(v_profile.competir_publico, true)
      then v_profile.avatar_url else null end,
    'user_id', v_user_id,
    'is_me', true,
    'likes', v_comentario.likes,
    'dislikes', v_comentario.dislikes,
    'meu_voto', coalesce((
      select valor from public.questao_comentario_voto
      where comentario_id = p_comentario_id and user_id = v_user_id
    ), 0),
    'criado_em', v_comentario.criado_em,
    'respostas', '[]'::jsonb
  );
end;
$$;

revoke execute on function public.editar_comentario_questao(uuid, text) from public;
revoke execute on function public.editar_comentario_questao(uuid, text) from anon;
grant execute on function public.editar_comentario_questao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: excluir_comentario_questao
-- ---------------------------------------------------------------------------
create or replace function public.excluir_comentario_questao(p_comentario_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_tem_respostas boolean;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.questao_comentario
    where id = p_comentario_id
      and (user_id = v_user_id or public.is_admin())
  ) then
    raise exception 'Comentario nao encontrado ou sem permissao' using errcode = 'P0007';
  end if;

  select exists (
    select 1 from public.questao_comentario
    where parent_id = p_comentario_id and status = 'ativo'
  ) into v_tem_respostas;

  if v_tem_respostas then
    update public.questao_comentario set status = 'removido'
    where id = p_comentario_id;
  else
    delete from public.questao_comentario where id = p_comentario_id;
  end if;
end;
$$;

revoke execute on function public.excluir_comentario_questao(uuid) from public;
revoke execute on function public.excluir_comentario_questao(uuid) from anon;
grant execute on function public.excluir_comentario_questao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: votar_comentario_questao
-- ---------------------------------------------------------------------------
create or replace function public.votar_comentario_questao(
  p_comentario_id uuid,
  p_valor smallint
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_voto_atual smallint;
  v_comentario public.questao_comentario;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if p_valor not in (-1, 1) then
    raise exception 'Valor de voto invalido (use 1 para like ou -1 para dislike)' using errcode = 'P0008';
  end if;

  select valor into v_voto_atual
  from public.questao_comentario_voto
  where comentario_id = p_comentario_id and user_id = v_user_id;

  if v_voto_atual = p_valor then
    -- Toggle: mesmo valor = remove o voto
    delete from public.questao_comentario_voto
    where comentario_id = p_comentario_id and user_id = v_user_id;
  else
    insert into public.questao_comentario_voto (comentario_id, user_id, valor)
    values (p_comentario_id, v_user_id, p_valor)
    on conflict (comentario_id, user_id) do update set valor = excluded.valor;
  end if;

  -- O trigger ja recalculou likes/dislikes; buscar estado atual
  select * into v_comentario from public.questao_comentario where id = p_comentario_id;

  return jsonb_build_object(
    'likes', v_comentario.likes,
    'dislikes', v_comentario.dislikes,
    'meu_voto', coalesce((
      select valor from public.questao_comentario_voto
      where comentario_id = p_comentario_id and user_id = v_user_id
    ), 0)
  );
end;
$$;

revoke execute on function public.votar_comentario_questao(uuid, smallint) from public;
revoke execute on function public.votar_comentario_questao(uuid, smallint) from anon;
grant execute on function public.votar_comentario_questao(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: denunciar_comentario_questao
-- ---------------------------------------------------------------------------
create or replace function public.denunciar_comentario_questao(
  p_comentario_id uuid,
  p_motivo text default null
)
returns void
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $$
  insert into public.questao_comentario_denuncia (comentario_id, user_id, motivo)
  values (
    p_comentario_id,
    auth.uid(),
    case when btrim(coalesce(p_motivo, '')) = '' then null else btrim(p_motivo) end
  )
  on conflict (comentario_id, user_id) do nothing;
$$;

revoke execute on function public.denunciar_comentario_questao(uuid, text) from public;
revoke execute on function public.denunciar_comentario_questao(uuid, text) from anon;
grant execute on function public.denunciar_comentario_questao(uuid, text) to authenticated;
