CREATE OR REPLACE FUNCTION get_streak_estudo()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dias AS (
    SELECT DISTINCT (finalizada_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM tentativa
    WHERE user_id = auth.uid()
      AND status = 'finalizada'
      AND modo <> 'visualizar'
      AND finalizada_em IS NOT NULL
  ),
  numerados AS (
    SELECT dia,
           dia - (ROW_NUMBER() OVER (ORDER BY dia))::int AS grp
    FROM dias
  ),
  streaks AS (
    SELECT grp, MIN(dia) AS inicio, MAX(dia) AS fim, COUNT(*)::int AS dias
    FROM numerados
    GROUP BY grp
  )
  SELECT COALESCE(
    (SELECT dias FROM streaks
     WHERE fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1
     ORDER BY fim DESC
     LIMIT 1),
    0
  );
$$;

REVOKE EXECUTE ON FUNCTION get_streak_estudo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_streak_estudo() TO authenticated;;
