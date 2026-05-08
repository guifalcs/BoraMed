alter table "public"."profiles" add column "atualizado_em" timestamp with time zone not null default now();

alter table "public"."profiles" add column "avatar_url" text;

alter table "public"."profiles" add column "nome_completo" text;

alter table "public"."profiles" add column "periodo" smallint;

alter table "public"."profiles" add constraint "profiles_periodo_check" CHECK (((periodo >= 1) AND (periodo <= 12))) not valid;

alter table "public"."profiles" validate constraint "profiles_periodo_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, nome_completo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    )
  );
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER on_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();


  create policy "avatars_select_own"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
  using ((bucket_id = 'avatars'::text));



  create policy "avatars_delete_own"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "avatars_insert_own"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "avatars_update_own"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

revoke execute on function public.handle_new_user()   from anon, authenticated;
revoke execute on function public.handle_new_user()   from public;
revoke execute on function public.set_atualizado_em() from anon, authenticated;
revoke execute on function public.set_atualizado_em() from public;

-- anon não deve acessar profiles de nenhuma forma
revoke all on public.profiles from anon;

-- authenticated: apenas SELECT (ler perfil) e UPDATE (editar próprio perfil)
-- INSERT é exclusivo do trigger handle_new_user; DELETE não é exposto ao usuário
revoke insert, delete, truncate, trigger, references on public.profiles from authenticated;
