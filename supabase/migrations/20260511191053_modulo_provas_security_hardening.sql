revoke delete on table "public"."alternativa" from "anon";
revoke insert on table "public"."alternativa" from "anon";
revoke references on table "public"."alternativa" from "anon";
revoke select on table "public"."alternativa" from "anon";
revoke trigger on table "public"."alternativa" from "anon";
revoke truncate on table "public"."alternativa" from "anon";
revoke update on table "public"."alternativa" from "anon";
revoke delete on table "public"."alternativa" from "authenticated";
revoke insert on table "public"."alternativa" from "authenticated";
revoke truncate on table "public"."alternativa" from "authenticated";
revoke update on table "public"."alternativa" from "authenticated";

revoke delete on table "public"."faculdade" from "anon";
revoke insert on table "public"."faculdade" from "anon";
revoke references on table "public"."faculdade" from "anon";
revoke select on table "public"."faculdade" from "anon";
revoke trigger on table "public"."faculdade" from "anon";
revoke truncate on table "public"."faculdade" from "anon";
revoke update on table "public"."faculdade" from "anon";
revoke delete on table "public"."faculdade" from "authenticated";
revoke insert on table "public"."faculdade" from "authenticated";
revoke truncate on table "public"."faculdade" from "authenticated";
revoke update on table "public"."faculdade" from "authenticated";

revoke delete on table "public"."prova" from "anon";
revoke insert on table "public"."prova" from "anon";
revoke references on table "public"."prova" from "anon";
revoke select on table "public"."prova" from "anon";
revoke trigger on table "public"."prova" from "anon";
revoke truncate on table "public"."prova" from "anon";
revoke update on table "public"."prova" from "anon";
revoke delete on table "public"."prova" from "authenticated";
revoke insert on table "public"."prova" from "authenticated";
revoke truncate on table "public"."prova" from "authenticated";
revoke update on table "public"."prova" from "authenticated";

revoke delete on table "public"."questao" from "anon";
revoke insert on table "public"."questao" from "anon";
revoke references on table "public"."questao" from "anon";
revoke select on table "public"."questao" from "anon";
revoke trigger on table "public"."questao" from "anon";
revoke truncate on table "public"."questao" from "anon";
revoke update on table "public"."questao" from "anon";
revoke delete on table "public"."questao" from "authenticated";
revoke insert on table "public"."questao" from "authenticated";
revoke truncate on table "public"."questao" from "authenticated";
revoke update on table "public"."questao" from "authenticated";

revoke delete on table "public"."questao_tema" from "anon";
revoke insert on table "public"."questao_tema" from "anon";
revoke references on table "public"."questao_tema" from "anon";
revoke select on table "public"."questao_tema" from "anon";
revoke trigger on table "public"."questao_tema" from "anon";
revoke truncate on table "public"."questao_tema" from "anon";
revoke update on table "public"."questao_tema" from "anon";
revoke delete on table "public"."questao_tema" from "authenticated";
revoke insert on table "public"."questao_tema" from "authenticated";
revoke truncate on table "public"."questao_tema" from "authenticated";
revoke update on table "public"."questao_tema" from "authenticated";

revoke delete on table "public"."tema" from "anon";
revoke insert on table "public"."tema" from "anon";
revoke references on table "public"."tema" from "anon";
revoke select on table "public"."tema" from "anon";
revoke trigger on table "public"."tema" from "anon";
revoke truncate on table "public"."tema" from "anon";
revoke update on table "public"."tema" from "anon";
revoke delete on table "public"."tema" from "authenticated";
revoke insert on table "public"."tema" from "authenticated";
revoke truncate on table "public"."tema" from "authenticated";
revoke update on table "public"."tema" from "authenticated";

revoke delete on table "public"."tentativa" from "anon";
revoke insert on table "public"."tentativa" from "anon";
revoke references on table "public"."tentativa" from "anon";
revoke select on table "public"."tentativa" from "anon";
revoke trigger on table "public"."tentativa" from "anon";
revoke truncate on table "public"."tentativa" from "anon";
revoke update on table "public"."tentativa" from "anon";

revoke delete on table "public"."tentativa_resposta" from "anon";
revoke insert on table "public"."tentativa_resposta" from "anon";
revoke references on table "public"."tentativa_resposta" from "anon";
revoke select on table "public"."tentativa_resposta" from "anon";
revoke trigger on table "public"."tentativa_resposta" from "anon";
revoke truncate on table "public"."tentativa_resposta" from "anon";
revoke update on table "public"."tentativa_resposta" from "anon";

revoke execute on function public.iniciar_tentativa(uuid, text) from anon;
revoke execute on function public.retomar_tentativa(uuid) from anon;
revoke execute on function public.pausar_tentativa(uuid) from anon;
revoke execute on function public.finalizar_tentativa(uuid) from anon;

drop policy if exists "avatars_select_own" on "storage"."objects";
create policy "avatars_select_own" on "storage"."objects" as permissive for select to authenticated using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));;
