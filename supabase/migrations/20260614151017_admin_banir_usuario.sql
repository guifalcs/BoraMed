-- Suspensão administrativa de usuários.
-- Mantém a sessão autenticada para permitir acesso ao suporte,
-- mas remove privilégios administrativos e bloqueia a navegação normal.

alter table public.profiles
  add column if not exists atualizado_em timestamptz not null default now(),
  add column if not exists banido boolean not null default false,
  add column if not exists banido_em timestamptz,
  add column if not exists banido_por uuid references auth.users(id) on delete set null,
  add column if not exists motivo_banimento text;

drop trigger if exists trg_profiles_atualizado_em on public.profiles;
create trigger trg_profiles_atualizado_em
  before update on public.profiles
  for each row execute function public.set_atualizado_em();

create index if not exists profiles_banido_idx
  on public.profiles (banido)
  where banido = true;

create or replace function public.is_banned(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and banido = true
  );
$$;

create or replace function public.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and papel = 'super_admin'
      and banido = false
  );
$$;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and papel in ('admin', 'super_admin')
      and banido = false
  );
$$;

create or replace function public.prevent_ban_fields_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    new.banido is distinct from old.banido
    or new.banido_em is distinct from old.banido_em
    or new.banido_por is distinct from old.banido_por
    or new.motivo_banimento is distinct from old.motivo_banimento
  then
    if auth.uid() is null then
      return new;
    end if;

    if not public.is_admin(auth.uid()) then
      raise exception 'permission_denied: apenas administradores podem alterar suspensão de usuário'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_ban_fields_change() from public, anon, authenticated;

drop trigger if exists profiles_prevent_ban_fields_change on public.profiles;
create trigger profiles_prevent_ban_fields_change
  before update of banido, banido_em, banido_por, motivo_banimento on public.profiles
  for each row execute function public.prevent_ban_fields_change();

create or replace function public.admin_banir_usuario(
  p_user_id uuid,
  p_motivo text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_caller_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if not public.is_admin(v_caller_id) then
    raise exception 'permission_denied: acesso restrito a administradores'
      using errcode = 'P0001';
  end if;

  if p_user_id = v_caller_id then
    raise exception 'permission_denied: não é possível suspender a própria conta'
      using errcode = 'P0001';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0003';
  end if;

  if v_profile.papel = 'super_admin' then
    raise exception 'permission_denied: o super_admin não pode ser suspenso'
      using errcode = 'P0001';
  end if;

  if v_profile.papel = 'admin' and not public.is_super_admin(v_caller_id) then
    raise exception 'permission_denied: apenas o super_admin pode suspender administradores'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set
    banido = true,
    banido_em = now(),
    banido_por = v_caller_id,
    motivo_banimento = left(v_motivo, 1000),
    atualizado_em = now()
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.admin_desbanir_usuario(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if not public.is_admin(v_caller_id) then
    raise exception 'permission_denied: acesso restrito a administradores'
      using errcode = 'P0001';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0003';
  end if;

  if v_profile.papel = 'admin' and not public.is_super_admin(v_caller_id) then
    raise exception 'permission_denied: apenas o super_admin pode remover suspensão de administradores'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set
    banido = false,
    banido_em = null,
    banido_por = null,
    motivo_banimento = null,
    atualizado_em = now()
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'admin_impersonation_log',
    'avisos',
    'avisos_vistos',
    'conquista_catalogo',
    'desafio_diario',
    'desafio_diario_resposta',
    'disciplina',
    'faculdade',
    'gamificacao_evento',
    'notificacoes',
    'prova',
    'prova_questao',
    'questao',
    'questao_tema',
    'tema',
    'tentativa',
    'tentativa_resposta',
    'tentativa_questao_anotacao',
    'user_conquista',
    'user_gamificacao_stats',
    'user_onboarding_state'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('drop policy if exists banidos_bloqueados on public.%I', v_table);
      execute format(
        'create policy banidos_bloqueados on public.%I as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())',
        v_table
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.is_banned(uuid) from public, anon;
grant execute on function public.is_banned(uuid) to authenticated;

revoke execute on function public.admin_banir_usuario(uuid, text) from public, anon;
grant execute on function public.admin_banir_usuario(uuid, text) to authenticated;

revoke execute on function public.admin_desbanir_usuario(uuid) from public, anon;
grant execute on function public.admin_desbanir_usuario(uuid) to authenticated;
