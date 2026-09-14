-- Distribuição de alunos cruzando período x cidade da unidade, para o gráfico
-- do dashboard admin poder ser filtrado por cidade ("1º período em Ipatinga").
-- Substitui admin_get_distribuicao_periodos: a grade cruzada já responde o
-- total por período quando o front agrega todas as cidades.
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_get_distribuicao_periodo_unidade()
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
        'periodo', periodo,
        'total', total,
        'assinantes', assinantes
      ) ORDER BY faculdade_unidade NULLS LAST, periodo NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT
      p.faculdade_unidade,
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
    GROUP BY p.faculdade_unidade, p.periodo
  ) t;
  RETURN result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_get_distribuicao_periodo_unidade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_distribuicao_periodo_unidade() TO authenticated;

-- A versão só-por-período nasceu e morreu no mesmo dia: sai para não deixar
-- RPC órfã. O drop é depois do CREATE acima de propósito — a migration roda em
-- transação, então o front nunca vê os dois estados intermediários.
DROP FUNCTION IF EXISTS public.admin_get_distribuicao_periodos();
