-- Vincula temas a tipos de prova (nacional, processual, laboratorio).
-- NULL = tema disponível em todas as provas (comportamento padrão).
alter table "public"."tema"
  add column if not exists "tipos_prova" text[];

alter table "public"."tema"
  add constraint "tema_tipos_prova_check"
  check (
    tipos_prova is null
    or (
      array_length(tipos_prova, 1) >= 1
      and tipos_prova <@ array['nacional', 'processual', 'laboratorio']::text[]
    )
  )
  not valid;

alter table "public"."tema" validate constraint "tema_tipos_prova_check";

comment on column "public"."tema"."tipos_prova" is
  'Tipos de prova aos quais o tema se aplica (nacional, processual, laboratorio). NULL = todas as provas.';
