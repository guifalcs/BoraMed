-- Adiciona total_questoes_respondidas ao retorno de get_historico_kpis
CREATE OR REPLACE FUNCTION get_historico_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id                 uuid    := auth.uid();
  v_taxa_acerto             numeric;
  v_total_finalizadas       bigint;
  v_total_questoes          bigint;
  v_tema_mais_fraco         text;
  v_taxa_tema_fraco         numeric;
  v_ultima_nota             numeric;
  v_ultima_nota_data        text;
BEGIN
  -- Taxa de acerto geral, total de provas finalizadas e total de questões
  SELECT
    CASE
      WHEN sum(total_questoes) > 0
        THEN round(sum(acertos)::numeric / sum(total_questoes) * 100, 1)
      ELSE NULL
    END,
    count(*),
    coalesce(sum(total_questoes), 0)
  INTO v_taxa_acerto, v_total_finalizadas, v_total_questoes
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
    'taxa_acerto',               v_taxa_acerto,
    'total_finalizadas',         v_total_finalizadas,
    'total_questoes_respondidas', v_total_questoes,
    'tema_mais_fraco',           v_tema_mais_fraco,
    'taxa_tema_fraco',           v_taxa_tema_fraco,
    'ultima_nota',               v_ultima_nota,
    'ultima_nota_data',          v_ultima_nota_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_historico_kpis() TO authenticated;
