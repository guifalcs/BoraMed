drop policy "profiles_select_own" on "public"."profiles";
drop policy "profiles_update_own" on "public"."profiles";

CREATE INDEX idx_tentativa_resposta_alternativa_id ON public.tentativa_resposta USING btree (alternativa_id);

create policy "profiles_select_own" on "public"."profiles" as permissive for select to authenticated using ((( SELECT auth.uid() AS uid) = id));
create policy "profiles_update_own" on "public"."profiles" as permissive for update to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));;
