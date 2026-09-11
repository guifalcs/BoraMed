-- Assinantes no gráfico de distribuição por cidade passam a contar só quem
-- efetivamente pagou: acesso de cortesia (assinatura.cortesia) fica de fora.
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
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'faculdade_unidade', faculdade_unidade,
        'total', total,
        'assinantes', assinantes
      ) ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT
      p.faculdade_unidade,
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.assinatura a
          WHERE a.user_id = p.id
            AND NOT a.cortesia
            AND (
              (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
              OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
            )
        )
      ) AS assinantes
    FROM public.profiles p
    GROUP BY p.faculdade_unidade
  ) t;
  RETURN result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_get_distribuicao_unidades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_distribuicao_unidades() TO authenticated;
