-- ============================================================================
-- XP de tentativa deixa de depender do cliente.
--
-- Bug: conceder_xp_tentativa só era chamada pelo front (finalizar/consolidar).
-- Se a chamada falhava (rede, aba fechada, navegação imediata pós-finalizar),
-- a prova ficava sem XP para sempre e o aluno não recebia aviso nenhum.
--
-- Agora o XP é concedido no servidor, dentro de consolidar_pontos_tentativa
-- (ponto canônico em que a nota fecha, chamado por finalizar_tentativa e por
-- consolidar_correcoes_tentativa). A RPC do cliente vira idempotente de fato:
-- devolve o XP do evento já existente.
--
-- O cap diário de 500 XP por tentativas também cai aqui: era a segunda causa
-- das "provas que não pontuam" (prova nacional grande calcula ~650 XP, estoura
-- o teto e zera tudo o que vier depois no mesmo dia). Eventos antigos cortados
-- pelo cap são recreditados pelo valor cheio (metadata.xp_calculado).
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

-------------------------------------------------------------------------------
-- 1. conceder_xp_tentativa_interno — cálculo + insert idempotente, sem auth.uid()
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.conceder_xp_tentativa_interno(p_tentativa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tentativa       public.tentativa%rowtype;
  v_evento          public.gamificacao_evento%rowtype;
  v_idempotency_key text;
  v_base            integer;
  v_bonus_nota      integer;
  v_bonus_tempo     integer;
  v_tempo_medio     numeric;
  v_xp_calculado    integer;
BEGIN
  SELECT * INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('xp_ganho', 0, 'ja_concedido', false, 'concedido_agora', false);
  END IF;

  v_idempotency_key := 'tentativa:' || p_tentativa_id::text;

  SELECT * INTO v_evento
  FROM public.gamificacao_evento
  WHERE user_id = v_tentativa.user_id AND idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'xp_ganho',        v_evento.xp,
      'ja_concedido',    true,
      'concedido_agora', v_evento.criado_em > now() - interval '10 minutes'
    );
  END IF;

  IF v_tentativa.status <> 'finalizada' OR v_tentativa.modo = 'visualizar' THEN
    RETURN jsonb_build_object('xp_ganho', 0, 'ja_concedido', false, 'concedido_agora', false);
  END IF;

  -- XP base: 10 XP por acerto — com discursivas usa os pontos consolidados
  -- (10 XP por 100 pontos).
  v_base := GREATEST(
    round(COALESCE(v_tentativa.pontos, COALESCE(v_tentativa.acertos, 0) * 100)::numeric / 10),
    0
  )::integer;

  v_bonus_nota := CASE
    WHEN COALESCE(v_tentativa.nota, 0) >= 70 THEN 50
    WHEN COALESCE(v_tentativa.nota, 0) >= 50 THEN 20
    ELSE 0
  END;

  v_tempo_medio := CASE
    WHEN COALESCE(v_tentativa.total_respondidas, 0) > 0
    THEN v_tentativa.tempo_acumulado_segundos::numeric / v_tentativa.total_respondidas
    ELSE NULL
  END;

  v_bonus_tempo := CASE
    WHEN v_tempo_medio IS NOT NULL
      AND v_tempo_medio < 60
      AND COALESCE(v_tentativa.nota, 0) >= 50
    THEN 15
    ELSE 0
  END;

  -- Sem cap diário: a tentativa vale o que calculou.
  v_xp_calculado := v_base + v_bonus_nota + v_bonus_tempo;

  INSERT INTO public.gamificacao_evento (user_id, tipo, xp, metadata, idempotency_key)
  VALUES (
    v_tentativa.user_id, 'tentativa', v_xp_calculado,
    jsonb_build_object(
      'tentativa_id', p_tentativa_id,
      'xp_calculado', v_xp_calculado,
      'base',         v_base,
      'bonus_nota',   v_bonus_nota,
      'bonus_tempo',  v_bonus_tempo
    ),
    v_idempotency_key
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'xp_ganho',        v_xp_calculado,
    'ja_concedido',    false,
    'concedido_agora', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.conceder_xp_tentativa_interno(uuid) FROM public, anon, authenticated;

-------------------------------------------------------------------------------
-- 2. conceder_xp_tentativa — wrapper do cliente (auth + conquistas + stats)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.conceder_xp_tentativa(p_tentativa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_existe  boolean;
  v_xp      jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT true INTO v_existe
  FROM public.tentativa
  WHERE id = p_tentativa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada' USING ERRCODE = 'P0003';
  END IF;

  v_xp := public.conceder_xp_tentativa_interno(p_tentativa_id);

  RETURN v_xp || jsonb_build_object(
    'novas_conquistas', public.verificar_conquistas_usuario(v_user_id),
    'stats',            public.get_meu_xp()
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.conceder_xp_tentativa(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.conceder_xp_tentativa(uuid) TO authenticated;

-------------------------------------------------------------------------------
-- 3. consolidar_pontos_tentativa — concede o XP no servidor ao fechar a nota
--    (base: 20260722150000 — anuladas fora do denominador e das stats)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consolidar_pontos_tentativa(p_tentativa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_tentativa record;
  v_total integer;
  v_sem_ia integer;
  v_soma numeric;
begin
  select * into v_tentativa
  from public.tentativa
  where id = p_tentativa_id
  for update;

  if not found or v_tentativa.status <> 'finalizada' or v_tentativa.total_pontuaveis is not null then
    return; -- não finalizada ou já consolidada
  end if;

  -- Anuladas (admin ou usuário) saem por completo do cálculo da nota.
  select
    count(*) filter (where not (q.anulada or tr.anulada_usuario)),
    count(*) filter (where not (q.anulada or tr.anulada_usuario) and rc.status = 'sem_ia'),
    coalesce(sum(
      case when (q.anulada or tr.anulada_usuario) then 0
           when rc.status = 'sem_ia' then 0
           else coalesce(tr.pontos::numeric, (tr.correta)::int::numeric * 100, 0)
      end
    ), 0)
  into v_total, v_sem_ia, v_soma
  from public.tentativa_resposta tr
  join public.questao q on q.id = tr.questao_id
  left join public.resposta_correcao rc on rc.tentativa_resposta_id = tr.id
  where tr.tentativa_id = p_tentativa_id;

  update public.tentativa
  set pontos = v_soma,
      total_pontuaveis = v_total - v_sem_ia,
      nota = round(v_soma / nullif(v_total - v_sem_ia, 0), 1)
  where id = p_tentativa_id;

  -- Stats das questões abertas corrigidas (D17: acerto = pontos >= 70).
  -- Anuladas ficam fora das estatísticas (também estão fora da nota).
  update public.questao q
  set vezes_respondida = q.vezes_respondida + 1,
      vezes_acertada = q.vezes_acertada + case when tr.pontos >= 70 then 1 else 0 end,
      taxa_acerto = round(
        ((q.vezes_acertada + case when tr.pontos >= 70 then 1 else 0 end)::numeric
          / (q.vezes_respondida + 1)) * 100,
        2
      )
  from public.tentativa_resposta tr
  join public.resposta_correcao rc on rc.tentativa_resposta_id = tr.id
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = q.id
    and q.formato = 'resposta_aberta_curta'
    and rc.status = 'corrigida'
    and tr.respondida_em is not null
    and not (q.anulada or tr.anulada_usuario);

  -- XP no servidor: a nota fechou aqui, então o evento não depende mais de o
  -- cliente conseguir chamar conceder_xp_tentativa.
  perform public.conceder_xp_tentativa_interno(p_tentativa_id);
end;
$$;

REVOKE ALL ON FUNCTION public.consolidar_pontos_tentativa(uuid) FROM public, anon, authenticated;

-------------------------------------------------------------------------------
-- 4. Recrédito — eventos cortados pelo antigo cap diário voltam ao valor cheio
-------------------------------------------------------------------------------

UPDATE public.gamificacao_evento
SET xp = (metadata ->> 'xp_calculado')::integer
WHERE tipo = 'tentativa'
  AND metadata ? 'xp_calculado'
  AND (metadata ->> 'xp_calculado')::integer > xp;

-------------------------------------------------------------------------------
-- 5. Backfill — tentativas finalizadas e consolidadas que ficaram sem evento
--    de XP (o bug), pelo valor cheio (sem cap).
-------------------------------------------------------------------------------

WITH pendentes AS (
  SELECT
    t.id,
    t.user_id,
    t.finalizada_em,
    (
      GREATEST(round(COALESCE(t.pontos, COALESCE(t.acertos, 0) * 100)::numeric / 10), 0)::integer
      + CASE
          WHEN COALESCE(t.nota, 0) >= 70 THEN 50
          WHEN COALESCE(t.nota, 0) >= 50 THEN 20
          ELSE 0
        END
      + CASE
          WHEN COALESCE(t.total_respondidas, 0) > 0
            AND t.tempo_acumulado_segundos::numeric / t.total_respondidas < 60
            AND COALESCE(t.nota, 0) >= 50
          THEN 15
          ELSE 0
        END
    ) AS xp_calculado
  FROM public.tentativa t
  WHERE t.status = 'finalizada'
    AND t.modo <> 'visualizar'
    AND t.finalizada_em IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.gamificacao_evento g
      WHERE g.user_id = t.user_id
        AND g.idempotency_key = 'tentativa:' || t.id::text
    )
)
INSERT INTO public.gamificacao_evento (user_id, tipo, xp, metadata, idempotency_key, criado_em)
SELECT
  user_id,
  'tentativa',
  xp_calculado,
  jsonb_build_object(
    'tentativa_id', id,
    'xp_calculado', xp_calculado,
    'backfill',     true
  ),
  'tentativa:' || id::text,
  finalizada_em
FROM pendentes
ON CONFLICT (user_id, idempotency_key) DO NOTHING;

-------------------------------------------------------------------------------
-- 6. Recalcula as stats a partir dos eventos — recrédito e backfill mexem em
--    eventos com criado_em retroativo, então xp_total/xp_semana_atual/nivel são
--    refeitos do zero (o trigger só soma no insert e sobrescreveria a semana).
-------------------------------------------------------------------------------

WITH semana AS (
  SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'IYYY-"W"IW') AS iso
),
agg AS (
  SELECT
    e.user_id,
    SUM(e.xp)::bigint AS total,
    COALESCE(SUM(e.xp) FILTER (
      WHERE to_char((e.criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'IYYY-"W"IW')
            = (SELECT iso FROM semana)
    ), 0)::integer AS xp_semana
  FROM public.gamificacao_evento e
  GROUP BY e.user_id
)
UPDATE public.user_gamificacao_stats s
SET xp_total        = agg.total,
    xp_semana_atual = agg.xp_semana,
    semana_iso      = (SELECT iso FROM semana),
    nivel           = floor(sqrt(agg.total::numeric / 100))::smallint,
    atualizado_em   = now()
FROM agg
WHERE agg.user_id = s.user_id;
