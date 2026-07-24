-- Auditoria 2026-07-24 — itens M1 (defesa em profundidade nas RPCs `admin_*`)
-- e B1 (FK sem índice de cobertura em `cupom.plano_id`).
--
-- CONTEXTO M1: as três funções abaixo são concedidas a `authenticated` e NÃO
-- validavam papel no corpo. Hoje o vazamento é contido pela RLS, porque as três
-- são SECURITY INVOKER (a RLS do chamador é aplicada):
--   * admin_listar_avisos  → `avisos_select_authenticated USING (ativo = true)`
--     já esconde avisos inativos de quem não é admin;
--   * admin_listar_faq     → FAQ é legível por qualquer autenticado de qualquer forma;
--   * admin_buscar_questao_ids_por_texto → a policy de `questao`/`alternativa`
--     exige `tem_assinatura_ativa()`, então não-assinante não casa nenhuma linha.
--
-- Ainda assim, a proteção depender só da RLS é frágil: basta alguém converter
-- uma delas para SECURITY DEFINER (padrão dominante no projeto) ou afrouxar uma
-- policy para o nome `admin_*` virar uma porta aberta de verdade. O guard
-- explícito torna a intenção executável — least privilege, não convenção.
--
-- As três permanecem SECURITY INVOKER de propósito: o guard é uma camada EXTRA
-- sobre a RLS, não um substituto dela.
--
-- CREATE OR REPLACE preserva os GRANTs existentes (execute to authenticated),
-- por isso não há necessidade de reemiti-los aqui.

------------------------------------------------------------------------------
-- M1.1 — admin_listar_avisos: exigir admin (antes: qualquer autenticado)
------------------------------------------------------------------------------
create or replace function public.admin_listar_avisos()
returns setof public.avisos
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  return query
    select * from public.avisos order by criado_em desc;
end;
$function$;

------------------------------------------------------------------------------
-- M1.2 — admin_listar_faq: exigir admin
------------------------------------------------------------------------------
create or replace function public.admin_listar_faq()
returns setof public.suporte_faq
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  return query
    select * from public.suporte_faq order by ordem, criado_em;
end;
$function$;

------------------------------------------------------------------------------
-- M1.3 — admin_buscar_questao_ids_por_texto: exigir admin
--
-- Corpo idêntico ao de 20260721120000, apenas com o guard. O
-- `#variable_conflict use_column` evita ambiguidade entre a coluna
-- `alternativa.questao_id` e a coluna de saída homônima do RETURNS TABLE.
------------------------------------------------------------------------------
create or replace function public.admin_buscar_questao_ids_por_texto(p_termo text)
returns table(questao_id uuid)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  return query
    with termo as (
      select btrim(regexp_replace(coalesce(p_termo, ''), '\s+', ' ', 'g')) as valor
    )
    select q.id
    from public.questao q, termo
    where termo.valor <> ''
      and (
        regexp_replace(q.enunciado, '\s+', ' ', 'g') ilike '%' || termo.valor || '%'
        or regexp_replace(coalesce(q.enunciado_apoio, ''), '\s+', ' ', 'g') ilike '%' || termo.valor || '%'
      )
    union
    select a.questao_id
    from public.alternativa a, termo
    where termo.valor <> ''
      and regexp_replace(a.texto, '\s+', ' ', 'g') ilike '%' || termo.valor || '%';
end;
$function$;

------------------------------------------------------------------------------
-- B1 — índice de cobertura da FK `cupom.plano_id`
--
-- Advisor `unindexed_foreign_keys`. A tabela é pequena hoje, mas sem o índice
-- todo DELETE/UPDATE em `plano` faz seq scan em `cupom` para validar a FK
-- (ON DELETE CASCADE).
------------------------------------------------------------------------------
create index if not exists idx_cupom_plano_id on public.cupom (plano_id);
