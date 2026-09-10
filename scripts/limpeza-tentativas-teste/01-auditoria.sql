-- ============================================================
-- AUDITORIA (somente leitura). Rode ANTES de qualquer delete.
-- Lista as tentativas do Arthur Coelho e classifica o que tem
-- cara de rodada de teste de funcionalidade.
--
-- Troque o e-mail se necessário.
-- ============================================================

WITH alvo AS (
  SELECT id FROM public.profiles WHERE lower(email) = 'arthur@exemplo.com'
)
SELECT
  t.id,
  t.modo,
  t.status,
  t.total_questoes,
  t.total_respondidas,
  t.acertos,
  t.nota,
  t.tempo_acumulado_segundos,
  round(t.tempo_acumulado_segundos::numeric / NULLIF(t.total_respondidas, 0), 1) AS seg_por_questao,
  t.iniciada_em,
  t.finalizada_em,
  pr.titulo AS prova,
  CASE
    WHEN t.status <> 'finalizada'                               THEN 'incompleta'
    WHEN t.modo = 'visualizar'                                  THEN 'modo visualizar'
    WHEN t.total_respondidas < t.total_questoes                 THEN 'nao respondeu tudo'
    WHEN t.tempo_acumulado_segundos::numeric
         / NULLIF(t.total_respondidas, 0) < 15                  THEN 'rapida demais (<15s/questao)'
    ELSE 'parece real'
  END AS classificacao
FROM public.tentativa t
JOIN alvo a ON a.id = t.user_id
LEFT JOIN public.prova pr ON pr.id = t.prova_id
ORDER BY t.iniciada_em;

-- Média atual x média removendo só as classificadas como teste
WITH alvo AS (
  SELECT id FROM public.profiles WHERE lower(email) = 'arthur@exemplo.com'
), base AS (
  SELECT t.nota,
         (t.modo <> 'visualizar'
          AND t.total_respondidas >= t.total_questoes
          AND t.tempo_acumulado_segundos::numeric
              / NULLIF(t.total_respondidas, 0) >= 15) AS eh_real
  FROM public.tentativa t
  JOIN alvo a ON a.id = t.user_id
  WHERE t.status = 'finalizada' AND t.nota IS NOT NULL
)
SELECT
  count(*)                                   AS finalizadas,
  round(avg(nota), 1)                        AS media_atual,
  count(*) FILTER (WHERE eh_real)            AS reais,
  round(avg(nota) FILTER (WHERE eh_real), 1) AS media_sem_testes
FROM base;
