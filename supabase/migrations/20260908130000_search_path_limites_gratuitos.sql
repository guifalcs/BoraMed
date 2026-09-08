-- Fixa o search_path das funções de limite do plano gratuito.
--
-- Follow-up imediato de 20260908120000: as três funções foram criadas como SQL
-- IMMUTABLE sem `SET search_path`, e o advisor de segurança do Supabase acusa
-- `function_search_path_mutable` nas três.
--
-- Risco real aqui é baixo (retornam constante e as chamadas internas já são
-- schema-qualificadas), mas o projeto trata esse advisor como ruído que não
-- pode existir — ver a auditoria de 18/08. `limite_tentativas_gratuitas()` já
-- vinha assim desde 20260801115817; entra de carona.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas_nacional()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 2;
$function$
;

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas_montado()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.limite_tentativas_gratuitas_nacional()
       + public.limite_tentativas_gratuitas_montado();
$function$
;

------------------------------------------------------------------------------
-- Grants (não emitidos pelo `db pull` — ver aviso no cabeçalho)
------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas_nacional() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas_nacional() TO authenticated;

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas_montado() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas_montado() TO authenticated;

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas() TO authenticated;
