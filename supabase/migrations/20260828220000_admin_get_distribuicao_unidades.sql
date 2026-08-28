set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_get_distribuicao_unidades()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('faculdade_unidade', faculdade_unidade, 'total', total) ORDER BY total DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT faculdade_unidade, COUNT(*) AS total
    FROM public.profiles
    GROUP BY faculdade_unidade
  ) t;
  RETURN result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_get_distribuicao_unidades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_distribuicao_unidades() TO authenticated;


