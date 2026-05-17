
-- Convert pure read-only RPCs to SECURITY INVOKER (safe: RLS policies support it)
-- Re-create FK covering indexes that were dropped (needed for FK constraint perf)

-- ============================================================
-- 1. Convert read-only functions to SECURITY INVOKER
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_desempenho_por_tema()
 RETURNS TABLE(tema_nome text, total bigint, acertos bigint, taxa numeric)
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    t.nome::text                                                        AS tema_nome,
    count(*)::bigint                                                    AS total,
    sum(CASE WHEN tr.correta THEN 1 ELSE 0 END)::bigint               AS acertos,
    round(
      sum(CASE WHEN tr.correta THEN 1 ELSE 0 END)::numeric / count(*) * 100,
      1
    )                                                                   AS taxa
  FROM tentativa_resposta tr
  JOIN tentativa    ten ON ten.id        = tr.tentativa_id
  JOIN questao_tema qt  ON qt.questao_id = tr.questao_id
  JOIN tema         t   ON t.id          = qt.tema_id
  WHERE ten.user_id          = v_user_id
    AND ten.status           = 'finalizada'
    AND ten.modo            != 'visualizar'
    AND tr.alternativa_id IS NOT NULL
  GROUP BY t.id, t.nome
  HAVING count(*) >= 3
  ORDER BY taxa ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_historico_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id          uuid    := auth.uid();
  v_taxa_acerto      numeric;
  v_total_finalizadas bigint;
  v_tema_mais_fraco  text;
  v_taxa_tema_fraco  numeric;
  v_ultima_nota      numeric;
  v_ultima_nota_data text;
BEGIN
  -- Taxa de acerto geral e total de provas finalizadas
  SELECT
    CASE
      WHEN sum(total_questoes) > 0
        THEN round(sum(acertos)::numeric / sum(total_questoes) * 100, 1)
      ELSE NULL
    END,
    count(*)
  INTO v_taxa_acerto, v_total_finalizadas
  FROM tentativa
  WHERE user_id = v_user_id
    AND status   = 'finalizada'
    AND modo    != 'visualizar';

  -- Última nota
  SELECT nota, finalizada_em
  INTO   v_ultima_nota, v_ultima_nota_data
  FROM   tentativa
  WHERE  user_id = v_user_id
    AND  status  = 'finalizada'
    AND  modo   != 'visualizar'
    AND  nota IS NOT NULL
  ORDER  BY finalizada_em DESC
  LIMIT  1;

  -- Tema mais fraco (mín. 3 questões respondidas naquele tema)
  SELECT
    t.nome,
    round(
      sum(CASE WHEN tr.correta THEN 1 ELSE 0 END)::numeric / count(*) * 100,
      1
    )
  INTO v_tema_mais_fraco, v_taxa_tema_fraco
  FROM tentativa_resposta tr
  JOIN tentativa    ten ON ten.id        = tr.tentativa_id
  JOIN questao_tema qt  ON qt.questao_id = tr.questao_id
  JOIN tema         t   ON t.id          = qt.tema_id
  WHERE ten.user_id          = v_user_id
    AND ten.status           = 'finalizada'
    AND ten.modo            != 'visualizar'
    AND tr.alternativa_id IS NOT NULL
  GROUP BY t.id, t.nome
  HAVING count(*) >= 3
  ORDER BY round(
    sum(CASE WHEN tr.correta THEN 1 ELSE 0 END)::numeric / count(*) * 100,
    1
  ) ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'taxa_acerto',        v_taxa_acerto,
    'total_finalizadas',  v_total_finalizadas,
    'tema_mais_fraco',    v_tema_mais_fraco,
    'taxa_tema_fraco',    v_taxa_tema_fraco,
    'ultima_nota',        v_ultima_nota,
    'ultima_nota_data',   v_ultima_nota_data
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_streak_estudo()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.listar_temas_com_contagem()
 RETURNS TABLE(id uuid, nome text, disciplina text, periodo integer, parent_id uuid, criado_em timestamp with time zone, qtd_questoes bigint)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    t.id,
    t.nome,
    t.disciplina,
    t.periodo,
    t.parent_id,
    t.criado_em,
    COUNT(q.id) AS qtd_questoes
  FROM tema t
  LEFT JOIN questao_tema qt ON qt.tema_id = t.id
  LEFT JOIN questao q ON q.id = qt.questao_id AND q.status = 'ativa'
  GROUP BY t.id, t.nome, t.disciplina, t.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$function$;

-- ============================================================
-- 2. Re-create FK covering indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_desafio_diario_questao_id
  ON public.desafio_diario (questao_id);

CREATE INDEX IF NOT EXISTS idx_desafio_diario_resposta_alternativa_id
  ON public.desafio_diario_resposta (alternativa_id);

CREATE INDEX IF NOT EXISTS idx_questao_autor_id
  ON public.questao (autor_id);

CREATE INDEX IF NOT EXISTS idx_questao_revisor_id
  ON public.questao (revisor_id);

CREATE INDEX IF NOT EXISTS idx_user_conquista_conquista_id
  ON public.user_conquista (conquista_id);
;
