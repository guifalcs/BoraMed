drop policy "tentativa_insert_own" on "public"."tentativa";
drop policy "tentativa_select_own" on "public"."tentativa";
drop policy "tentativa_update_own" on "public"."tentativa";
drop policy "tentativa_resposta_insert_own" on "public"."tentativa_resposta";
drop policy "tentativa_resposta_select_own" on "public"."tentativa_resposta";
drop policy "tentativa_resposta_update_own" on "public"."tentativa_resposta";

create policy "tentativa_insert_own" on "public"."tentativa" as permissive for insert to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "tentativa_select_own" on "public"."tentativa" as permissive for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "tentativa_update_own" on "public"."tentativa" as permissive for update to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "tentativa_resposta_insert_own" on "public"."tentativa_resposta" as permissive for insert to authenticated with check ((EXISTS ( SELECT 1 FROM public.tentativa t WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));
create policy "tentativa_resposta_select_own" on "public"."tentativa_resposta" as permissive for select to authenticated using ((EXISTS ( SELECT 1 FROM public.tentativa t WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));
create policy "tentativa_resposta_update_own" on "public"."tentativa_resposta" as permissive for update to authenticated using ((EXISTS ( SELECT 1 FROM public.tentativa t WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE OR REPLACE FUNCTION public.update_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;;
