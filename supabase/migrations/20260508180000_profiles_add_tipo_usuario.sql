alter table "public"."profiles"
  add column "tipo_usuario" text
  check (tipo_usuario in (
    'estudante_medicina',
    'medico',
    'residente',
    'cursinho',
    'ensino_medio',
    'outro'
  ));
