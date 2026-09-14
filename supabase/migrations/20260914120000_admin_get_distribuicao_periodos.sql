-- Distribuição de alunos por período (1..12) para o dashboard admin.
-- Mesma forma do admin_get_distribuicao_unidades: total por grupo + quantos são
-- assinantes pagantes (cortesia fora, como nas métricas financeiras).
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_get_distribuicao_periodos()
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
        'periodo', periodo,
        'total', total,
        'assinantes', assinantes
      ) ORDER BY periodo NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT
      p.periodo,
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
    GROUP BY p.periodo
  ) t;
  RETURN result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_get_distribuicao_periodos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_distribuicao_periodos() TO authenticated;
