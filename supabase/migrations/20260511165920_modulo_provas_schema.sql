
  create table "public"."alternativa" (
    "id" uuid not null default gen_random_uuid(),
    "questao_id" uuid not null,
    "letra" text not null,
    "texto" text not null,
    "correta" boolean not null default false,
    "ordem" integer not null,
    "imagem_url" text
      );


alter table "public"."alternativa" enable row level security;


  create table "public"."faculdade" (
    "id" uuid not null default gen_random_uuid(),
    "nome" text not null,
    "sigla" text not null,
    "rede" text not null,
    "ativa" boolean not null default true,
    "logo_url" text,
    "criado_em" timestamp with time zone not null default now()
      );


alter table "public"."faculdade" enable row level security;


  create table "public"."prova" (
    "id" uuid not null default gen_random_uuid(),
    "faculdade_id" uuid not null,
    "nome" text not null,
    "periodo" integer not null,
    "ano" integer not null,
    "semestre" integer not null,
    "tipo" text not null,
    "subtipo_nacional" text,
    "qtd_questoes" integer not null default 0,
    "tempo_sugerido_minutos" integer,
    "criado_em" timestamp with time zone not null default now()
      );


alter table "public"."prova" enable row level security;


  create table "public"."questao" (
    "id" uuid not null default gen_random_uuid(),
    "prova_id" uuid,
    "ordem_na_prova" integer,
    "codigo_externo" text,
    "enunciado_apoio" text,
    "enunciado" text not null,
    "imagem_url" text,
    "imagem_legenda" text,
    "formato" text not null,
    "resposta_correta_texto" text,
    "respostas_aceitas" text[],
    "explicacao" text,
    "explicacao_alternativas" jsonb,
    "referencia" text,
    "dificuldade" integer,
    "disciplina" text,
    "periodo" integer,
    "fonte" text,
    "vezes_respondida" integer not null default 0,
    "vezes_acertada" integer not null default 0,
    "taxa_acerto" numeric(5,2),
    "status" text not null default 'rascunho'::text,
    "revisado" boolean not null default false,
    "criado_em" timestamp with time zone not null default now(),
    "atualizado_em" timestamp with time zone not null default now()
      );


alter table "public"."questao" enable row level security;


  create table "public"."questao_tema" (
    "questao_id" uuid not null,
    "tema_id" uuid not null
      );


alter table "public"."questao_tema" enable row level security;


  create table "public"."tema" (
    "id" uuid not null default gen_random_uuid(),
    "nome" text not null,
    "disciplina" text,
    "periodo" integer,
    "parent_id" uuid,
    "criado_em" timestamp with time zone not null default now()
      );


alter table "public"."tema" enable row level security;


  create table "public"."tentativa" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "prova_id" uuid not null,
    "modo" text not null,
    "status" text not null default 'em_andamento'::text,
    "total_questoes" integer not null,
    "total_respondidas" integer not null default 0,
    "acertos" integer not null default 0,
    "nota" numeric(5,2),
    "iniciada_em" timestamp with time zone not null default now(),
    "pausada_em" timestamp with time zone,
    "tempo_acumulado_segundos" integer not null default 0,
    "finalizada_em" timestamp with time zone,
    "criado_em" timestamp with time zone not null default now()
      );


alter table "public"."tentativa" enable row level security;


  create table "public"."tentativa_resposta" (
    "id" uuid not null default gen_random_uuid(),
    "tentativa_id" uuid not null,
    "questao_id" uuid not null,
    "alternativa_id" uuid,
    "resposta_texto" text,
    "correta" boolean,
    "tempo_gasto_segundos" integer,
    "respondida_em" timestamp with time zone
      );


alter table "public"."tentativa_resposta" enable row level security;

CREATE UNIQUE INDEX alternativa_pkey ON public.alternativa USING btree (id);

CREATE UNIQUE INDEX faculdade_pkey ON public.faculdade USING btree (id);

CREATE INDEX idx_alternativa_questao_id ON public.alternativa USING btree (questao_id);

CREATE INDEX idx_faculdade_ativa ON public.faculdade USING btree (ativa);

CREATE INDEX idx_faculdade_nome ON public.faculdade USING btree (nome);

CREATE INDEX idx_prova_ano_periodo ON public.prova USING btree (ano, periodo);

CREATE INDEX idx_prova_faculdade_id ON public.prova USING btree (faculdade_id);

CREATE INDEX idx_prova_tipo ON public.prova USING btree (tipo);

CREATE INDEX idx_questao_prova_id_status ON public.questao USING btree (prova_id, status);

CREATE INDEX idx_questao_status ON public.questao USING btree (status);

CREATE INDEX idx_questao_tema_questao_id ON public.questao_tema USING btree (questao_id);

CREATE INDEX idx_questao_tema_tema_id ON public.questao_tema USING btree (tema_id);

CREATE INDEX idx_tema_disciplina ON public.tema USING btree (disciplina);

CREATE INDEX idx_tema_parent_id ON public.tema USING btree (parent_id);

CREATE INDEX idx_tentativa_prova_id ON public.tentativa USING btree (prova_id);

CREATE INDEX idx_tentativa_resposta_questao_id ON public.tentativa_resposta USING btree (questao_id);

CREATE INDEX idx_tentativa_resposta_tentativa_id ON public.tentativa_resposta USING btree (tentativa_id);

CREATE INDEX idx_tentativa_user_id ON public.tentativa USING btree (user_id);

CREATE INDEX idx_tentativa_user_prova_status ON public.tentativa USING btree (user_id, prova_id, status);

CREATE UNIQUE INDEX prova_pkey ON public.prova USING btree (id);

CREATE UNIQUE INDEX questao_pkey ON public.questao USING btree (id);

CREATE UNIQUE INDEX questao_tema_pkey ON public.questao_tema USING btree (questao_id, tema_id);

CREATE UNIQUE INDEX tema_pkey ON public.tema USING btree (id);

CREATE UNIQUE INDEX tentativa_pkey ON public.tentativa USING btree (id);

CREATE UNIQUE INDEX tentativa_resposta_pkey ON public.tentativa_resposta USING btree (id);

alter table "public"."alternativa" add constraint "alternativa_pkey" PRIMARY KEY using index "alternativa_pkey";

alter table "public"."faculdade" add constraint "faculdade_pkey" PRIMARY KEY using index "faculdade_pkey";

alter table "public"."prova" add constraint "prova_pkey" PRIMARY KEY using index "prova_pkey";

alter table "public"."questao" add constraint "questao_pkey" PRIMARY KEY using index "questao_pkey";

alter table "public"."questao_tema" add constraint "questao_tema_pkey" PRIMARY KEY using index "questao_tema_pkey";

alter table "public"."tema" add constraint "tema_pkey" PRIMARY KEY using index "tema_pkey";

alter table "public"."tentativa" add constraint "tentativa_pkey" PRIMARY KEY using index "tentativa_pkey";

alter table "public"."tentativa_resposta" add constraint "tentativa_resposta_pkey" PRIMARY KEY using index "tentativa_resposta_pkey";

alter table "public"."alternativa" add constraint "alternativa_letra_check" CHECK ((letra = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text]))) not valid;

alter table "public"."alternativa" validate constraint "alternativa_letra_check";

alter table "public"."alternativa" add constraint "alternativa_questao_id_fkey" FOREIGN KEY (questao_id) REFERENCES public.questao(id) ON DELETE CASCADE not valid;

alter table "public"."alternativa" validate constraint "alternativa_questao_id_fkey";

alter table "public"."prova" add constraint "prova_faculdade_id_fkey" FOREIGN KEY (faculdade_id) REFERENCES public.faculdade(id) ON DELETE RESTRICT not valid;

alter table "public"."prova" validate constraint "prova_faculdade_id_fkey";

alter table "public"."prova" add constraint "prova_subtipo_nacional_check" CHECK ((subtipo_nacional = ANY (ARRAY['N1'::text, 'teste_progresso'::text, 'N2'::text]))) not valid;

alter table "public"."prova" validate constraint "prova_subtipo_nacional_check";

alter table "public"."prova" add constraint "prova_tipo_check" CHECK ((tipo = ANY (ARRAY['nacional'::text, 'processual'::text, 'multiestacoes'::text]))) not valid;

alter table "public"."prova" validate constraint "prova_tipo_check";

alter table "public"."questao" add constraint "questao_dificuldade_check" CHECK (((dificuldade >= 1) AND (dificuldade <= 5))) not valid;

alter table "public"."questao" validate constraint "questao_dificuldade_check";

alter table "public"."questao" add constraint "questao_formato_check" CHECK ((formato = ANY (ARRAY['multipla_escolha'::text, 'resposta_aberta_curta'::text, 'verdadeiro_falso'::text, 'associacao'::text]))) not valid;

alter table "public"."questao" validate constraint "questao_formato_check";

alter table "public"."questao" add constraint "questao_prova_id_fkey" FOREIGN KEY (prova_id) REFERENCES public.prova(id) ON DELETE SET NULL not valid;

alter table "public"."questao" validate constraint "questao_prova_id_fkey";

alter table "public"."questao" add constraint "questao_status_check" CHECK ((status = ANY (ARRAY['ativa'::text, 'rascunho'::text, 'arquivada'::text, 'em_revisao'::text]))) not valid;

alter table "public"."questao" validate constraint "questao_status_check";

alter table "public"."questao_tema" add constraint "questao_tema_questao_id_fkey" FOREIGN KEY (questao_id) REFERENCES public.questao(id) ON DELETE CASCADE not valid;

alter table "public"."questao_tema" validate constraint "questao_tema_questao_id_fkey";

alter table "public"."questao_tema" add constraint "questao_tema_tema_id_fkey" FOREIGN KEY (tema_id) REFERENCES public.tema(id) ON DELETE CASCADE not valid;

alter table "public"."questao_tema" validate constraint "questao_tema_tema_id_fkey";

alter table "public"."tema" add constraint "tema_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.tema(id) ON DELETE SET NULL not valid;

alter table "public"."tema" validate constraint "tema_parent_id_fkey";

alter table "public"."tentativa" add constraint "tentativa_modo_check" CHECK ((modo = ANY (ARRAY['simulado'::text, 'estudo'::text, 'visualizar'::text]))) not valid;

alter table "public"."tentativa" validate constraint "tentativa_modo_check";

alter table "public"."tentativa" add constraint "tentativa_prova_id_fkey" FOREIGN KEY (prova_id) REFERENCES public.prova(id) ON DELETE RESTRICT not valid;

alter table "public"."tentativa" validate constraint "tentativa_prova_id_fkey";

alter table "public"."tentativa" add constraint "tentativa_status_check" CHECK ((status = ANY (ARRAY['em_andamento'::text, 'pausada'::text, 'finalizada'::text]))) not valid;

alter table "public"."tentativa" validate constraint "tentativa_status_check";

alter table "public"."tentativa" add constraint "tentativa_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."tentativa" validate constraint "tentativa_user_id_fkey";

alter table "public"."tentativa_resposta" add constraint "tentativa_resposta_alternativa_id_fkey" FOREIGN KEY (alternativa_id) REFERENCES public.alternativa(id) ON DELETE SET NULL not valid;

alter table "public"."tentativa_resposta" validate constraint "tentativa_resposta_alternativa_id_fkey";

alter table "public"."tentativa_resposta" add constraint "tentativa_resposta_questao_id_fkey" FOREIGN KEY (questao_id) REFERENCES public.questao(id) ON DELETE RESTRICT not valid;

alter table "public"."tentativa_resposta" validate constraint "tentativa_resposta_questao_id_fkey";

alter table "public"."tentativa_resposta" add constraint "tentativa_resposta_tentativa_id_fkey" FOREIGN KEY (tentativa_id) REFERENCES public.tentativa(id) ON DELETE CASCADE not valid;

alter table "public"."tentativa_resposta" validate constraint "tentativa_resposta_tentativa_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."alternativa" to "anon";

grant insert on table "public"."alternativa" to "anon";

grant references on table "public"."alternativa" to "anon";

grant select on table "public"."alternativa" to "anon";

grant trigger on table "public"."alternativa" to "anon";

grant truncate on table "public"."alternativa" to "anon";

grant update on table "public"."alternativa" to "anon";

grant delete on table "public"."alternativa" to "authenticated";

grant insert on table "public"."alternativa" to "authenticated";

grant references on table "public"."alternativa" to "authenticated";

grant select on table "public"."alternativa" to "authenticated";

grant trigger on table "public"."alternativa" to "authenticated";

grant truncate on table "public"."alternativa" to "authenticated";

grant update on table "public"."alternativa" to "authenticated";

grant delete on table "public"."alternativa" to "service_role";

grant insert on table "public"."alternativa" to "service_role";

grant references on table "public"."alternativa" to "service_role";

grant select on table "public"."alternativa" to "service_role";

grant trigger on table "public"."alternativa" to "service_role";

grant truncate on table "public"."alternativa" to "service_role";

grant update on table "public"."alternativa" to "service_role";

grant delete on table "public"."faculdade" to "anon";

grant insert on table "public"."faculdade" to "anon";

grant references on table "public"."faculdade" to "anon";

grant select on table "public"."faculdade" to "anon";

grant trigger on table "public"."faculdade" to "anon";

grant truncate on table "public"."faculdade" to "anon";

grant update on table "public"."faculdade" to "anon";

grant delete on table "public"."faculdade" to "authenticated";

grant insert on table "public"."faculdade" to "authenticated";

grant references on table "public"."faculdade" to "authenticated";

grant select on table "public"."faculdade" to "authenticated";

grant trigger on table "public"."faculdade" to "authenticated";

grant truncate on table "public"."faculdade" to "authenticated";

grant update on table "public"."faculdade" to "authenticated";

grant delete on table "public"."faculdade" to "service_role";

grant insert on table "public"."faculdade" to "service_role";

grant references on table "public"."faculdade" to "service_role";

grant select on table "public"."faculdade" to "service_role";

grant trigger on table "public"."faculdade" to "service_role";

grant truncate on table "public"."faculdade" to "service_role";

grant update on table "public"."faculdade" to "service_role";

grant delete on table "public"."prova" to "anon";

grant insert on table "public"."prova" to "anon";

grant references on table "public"."prova" to "anon";

grant select on table "public"."prova" to "anon";

grant trigger on table "public"."prova" to "anon";

grant truncate on table "public"."prova" to "anon";

grant update on table "public"."prova" to "anon";

grant delete on table "public"."prova" to "authenticated";

grant insert on table "public"."prova" to "authenticated";

grant references on table "public"."prova" to "authenticated";

grant select on table "public"."prova" to "authenticated";

grant trigger on table "public"."prova" to "authenticated";

grant truncate on table "public"."prova" to "authenticated";

grant update on table "public"."prova" to "authenticated";

grant delete on table "public"."prova" to "service_role";

grant insert on table "public"."prova" to "service_role";

grant references on table "public"."prova" to "service_role";

grant select on table "public"."prova" to "service_role";

grant trigger on table "public"."prova" to "service_role";

grant truncate on table "public"."prova" to "service_role";

grant update on table "public"."prova" to "service_role";

grant delete on table "public"."questao" to "anon";

grant insert on table "public"."questao" to "anon";

grant references on table "public"."questao" to "anon";

grant select on table "public"."questao" to "anon";

grant trigger on table "public"."questao" to "anon";

grant truncate on table "public"."questao" to "anon";

grant update on table "public"."questao" to "anon";

grant delete on table "public"."questao" to "authenticated";

grant insert on table "public"."questao" to "authenticated";

grant references on table "public"."questao" to "authenticated";

grant select on table "public"."questao" to "authenticated";

grant trigger on table "public"."questao" to "authenticated";

grant truncate on table "public"."questao" to "authenticated";

grant update on table "public"."questao" to "authenticated";

grant delete on table "public"."questao" to "service_role";

grant insert on table "public"."questao" to "service_role";

grant references on table "public"."questao" to "service_role";

grant select on table "public"."questao" to "service_role";

grant trigger on table "public"."questao" to "service_role";

grant truncate on table "public"."questao" to "service_role";

grant update on table "public"."questao" to "service_role";

grant delete on table "public"."questao_tema" to "anon";

grant insert on table "public"."questao_tema" to "anon";

grant references on table "public"."questao_tema" to "anon";

grant select on table "public"."questao_tema" to "anon";

grant trigger on table "public"."questao_tema" to "anon";

grant truncate on table "public"."questao_tema" to "anon";

grant update on table "public"."questao_tema" to "anon";

grant delete on table "public"."questao_tema" to "authenticated";

grant insert on table "public"."questao_tema" to "authenticated";

grant references on table "public"."questao_tema" to "authenticated";

grant select on table "public"."questao_tema" to "authenticated";

grant trigger on table "public"."questao_tema" to "authenticated";

grant truncate on table "public"."questao_tema" to "authenticated";

grant update on table "public"."questao_tema" to "authenticated";

grant delete on table "public"."questao_tema" to "service_role";

grant insert on table "public"."questao_tema" to "service_role";

grant references on table "public"."questao_tema" to "service_role";

grant select on table "public"."questao_tema" to "service_role";

grant trigger on table "public"."questao_tema" to "service_role";

grant truncate on table "public"."questao_tema" to "service_role";

grant update on table "public"."questao_tema" to "service_role";

grant delete on table "public"."tema" to "anon";

grant insert on table "public"."tema" to "anon";

grant references on table "public"."tema" to "anon";

grant select on table "public"."tema" to "anon";

grant trigger on table "public"."tema" to "anon";

grant truncate on table "public"."tema" to "anon";

grant update on table "public"."tema" to "anon";

grant delete on table "public"."tema" to "authenticated";

grant insert on table "public"."tema" to "authenticated";

grant references on table "public"."tema" to "authenticated";

grant select on table "public"."tema" to "authenticated";

grant trigger on table "public"."tema" to "authenticated";

grant truncate on table "public"."tema" to "authenticated";

grant update on table "public"."tema" to "authenticated";

grant delete on table "public"."tema" to "service_role";

grant insert on table "public"."tema" to "service_role";

grant references on table "public"."tema" to "service_role";

grant select on table "public"."tema" to "service_role";

grant trigger on table "public"."tema" to "service_role";

grant truncate on table "public"."tema" to "service_role";

grant update on table "public"."tema" to "service_role";

grant delete on table "public"."tentativa" to "anon";

grant insert on table "public"."tentativa" to "anon";

grant references on table "public"."tentativa" to "anon";

grant select on table "public"."tentativa" to "anon";

grant trigger on table "public"."tentativa" to "anon";

grant truncate on table "public"."tentativa" to "anon";

grant update on table "public"."tentativa" to "anon";

grant delete on table "public"."tentativa" to "authenticated";

grant insert on table "public"."tentativa" to "authenticated";

grant references on table "public"."tentativa" to "authenticated";

grant select on table "public"."tentativa" to "authenticated";

grant trigger on table "public"."tentativa" to "authenticated";

grant truncate on table "public"."tentativa" to "authenticated";

grant update on table "public"."tentativa" to "authenticated";

grant delete on table "public"."tentativa" to "service_role";

grant insert on table "public"."tentativa" to "service_role";

grant references on table "public"."tentativa" to "service_role";

grant select on table "public"."tentativa" to "service_role";

grant trigger on table "public"."tentativa" to "service_role";

grant truncate on table "public"."tentativa" to "service_role";

grant update on table "public"."tentativa" to "service_role";

grant delete on table "public"."tentativa_resposta" to "anon";

grant insert on table "public"."tentativa_resposta" to "anon";

grant references on table "public"."tentativa_resposta" to "anon";

grant select on table "public"."tentativa_resposta" to "anon";

grant trigger on table "public"."tentativa_resposta" to "anon";

grant truncate on table "public"."tentativa_resposta" to "anon";

grant update on table "public"."tentativa_resposta" to "anon";

grant delete on table "public"."tentativa_resposta" to "authenticated";

grant insert on table "public"."tentativa_resposta" to "authenticated";

grant references on table "public"."tentativa_resposta" to "authenticated";

grant select on table "public"."tentativa_resposta" to "authenticated";

grant trigger on table "public"."tentativa_resposta" to "authenticated";

grant truncate on table "public"."tentativa_resposta" to "authenticated";

grant update on table "public"."tentativa_resposta" to "authenticated";

grant delete on table "public"."tentativa_resposta" to "service_role";

grant insert on table "public"."tentativa_resposta" to "service_role";

grant references on table "public"."tentativa_resposta" to "service_role";

grant select on table "public"."tentativa_resposta" to "service_role";

grant trigger on table "public"."tentativa_resposta" to "service_role";

grant truncate on table "public"."tentativa_resposta" to "service_role";

grant update on table "public"."tentativa_resposta" to "service_role";


  create policy "alternativa_select_authenticated"
  on "public"."alternativa"
  as permissive
  for select
  to authenticated
using (true);



  create policy "faculdade_select_authenticated"
  on "public"."faculdade"
  as permissive
  for select
  to authenticated
using (true);



  create policy "prova_select_authenticated"
  on "public"."prova"
  as permissive
  for select
  to authenticated
using (true);



  create policy "questao_select_authenticated"
  on "public"."questao"
  as permissive
  for select
  to authenticated
using (true);



  create policy "questao_tema_select_authenticated"
  on "public"."questao_tema"
  as permissive
  for select
  to authenticated
using (true);



  create policy "tema_select_authenticated"
  on "public"."tema"
  as permissive
  for select
  to authenticated
using (true);



  create policy "tentativa_insert_own"
  on "public"."tentativa"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "tentativa_select_own"
  on "public"."tentativa"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "tentativa_update_own"
  on "public"."tentativa"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id));



  create policy "tentativa_resposta_insert_own"
  on "public"."tentativa_resposta"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.tentativa t
  WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = auth.uid())))));



  create policy "tentativa_resposta_select_own"
  on "public"."tentativa_resposta"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.tentativa t
  WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = auth.uid())))));



  create policy "tentativa_resposta_update_own"
  on "public"."tentativa_resposta"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.tentativa t
  WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = auth.uid())))));


CREATE TRIGGER questao_atualizado_em_trigger BEFORE UPDATE ON public.questao FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();


