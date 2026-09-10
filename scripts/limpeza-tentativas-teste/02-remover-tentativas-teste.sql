-- ============================================================
-- Remove as tentativas de TESTE do Arthur Coelho (rodadas feitas para
-- validar funcionalidade), preservando 100% do XP.
--
-- Por que o XP não é afetado:
--   gamificacao_evento e user_gamificacao_stats não têm FK nem trigger
--   ligados a public.tentativa. Apagar tentativa só cascateia para
--   tentativa_resposta e tentativa_questao_anotacao.
--
-- IMPORTANTE: rode 01-auditoria.sql antes e confira a lista. Os critérios
-- abaixo são objetivos (forma da rodada), não a nota. Não filtre por nota:
-- isso deixaria de ser limpeza de dado de teste.
--
-- Rode dentro da transação e confira o count antes do COMMIT.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _lixo ON COMMIT DROP AS
WITH alvo AS (
  SELECT id FROM public.profiles WHERE lower(email) = 'arthur@exemplo.com'
)
SELECT t.id
FROM public.tentativa t
JOIN alvo a ON a.id = t.user_id
WHERE
  -- rodada de teste: qualquer um destes
  t.status <> 'finalizada'
  OR t.modo = 'visualizar'
  OR t.total_respondidas < t.total_questoes
  OR t.tempo_acumulado_segundos::numeric / NULLIF(t.total_respondidas, 0) < 15;

-- confira antes de commitar
SELECT count(*) AS vai_apagar FROM _lixo;

DELETE FROM public.tentativa t USING _lixo l WHERE t.id = l.id;

-- média resultante
WITH alvo AS (
  SELECT id FROM public.profiles WHERE lower(email) = 'arthur@exemplo.com'
)
SELECT count(*) AS restantes, round(avg(t.nota), 1) AS media_final
FROM public.tentativa t
JOIN alvo a ON a.id = t.user_id
WHERE t.status = 'finalizada' AND t.nota IS NOT NULL;

-- XP intacto (compare com o valor de antes)
SELECT xp_total, nivel, streak_atual, streak_recorde
FROM public.user_gamificacao_stats
WHERE user_id = (SELECT id FROM public.profiles WHERE lower(email) = 'arthur@exemplo.com');

COMMIT;
