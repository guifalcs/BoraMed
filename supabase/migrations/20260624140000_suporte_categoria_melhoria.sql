-- Adiciona a categoria "melhoria" aos chamados de suporte.

alter table "public"."suporte_tickets"
  drop constraint if exists "suporte_tickets_categoria_check";

alter table "public"."suporte_tickets"
  add constraint "suporte_tickets_categoria_check"
  CHECK ((categoria = ANY (ARRAY[
    'problema_tecnico'::text,
    'duvida_conteudo'::text,
    'assinatura_pagamento'::text,
    'melhoria'::text,
    'outro'::text
  ]))) not valid;

alter table "public"."suporte_tickets"
  validate constraint "suporte_tickets_categoria_check";
