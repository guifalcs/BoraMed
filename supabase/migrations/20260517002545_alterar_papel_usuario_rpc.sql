create or replace function public.alterar_papel_usuario(
  p_user_id uuid,
  p_papel text
)
returns public.profiles
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado' using errcode = 'P0001';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'permission_denied: apenas administradores podem alterar papéis' using errcode = 'P0001';
  end if;

  if p_papel not in ('aluno', 'admin') then
    raise exception 'Papel inválido: %', p_papel using errcode = 'P0002';
  end if;

  if p_user_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'permission_denied: não é possível revogar o próprio papel de administrador' using errcode = 'P0001';
  end if;

  update public.profiles
  set papel = p_papel
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0003';
  end if;

  return v_profile;
end;
$function$;

revoke execute on function public.alterar_papel_usuario(uuid, text) from public;
revoke execute on function public.alterar_papel_usuario(uuid, text) from anon;
grant execute on function public.alterar_papel_usuario(uuid, text) to authenticated;
