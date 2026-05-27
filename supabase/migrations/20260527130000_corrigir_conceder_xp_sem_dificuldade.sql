-- Corrige conceder_xp_tentativa: remove referência a q.dificuldade
-- (coluna removida em 20260520180000_remover_dificuldade_e_campos_prova).
-- A variável v_bonus_dificuldade é eliminada; o XP é calculado apenas
-- por base (acertos) + bônus de nota + bônus de tempo.

CREATE OR REPLACE FUNCTION public.conceder_xp_tentativa(p_tentativa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id          uuid;
  v_tentativa        public.tentativa%rowtype;
  v_idempotency_key  text;
  v_base             integer;
  v_bonus_nota       integer;
  v_bonus_tempo      integer;
  v_xp_calculado     integer;
  v_xp_hoje          integer;
  v_xp_concedido     integer;
  v_tempo_medio      numeric;
  v_stats            jsonb;
  v_novas_conquistas jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tentativa
  FROM public.tentativa
  WHERE id = p_tentativa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada' USING ERRCODE = 'P0003';
  END IF;

  v_idempotency_key := 'tentativa:' || p_tentativa_id::text;

  IF EXISTS (
    SELECT 1 FROM public.gamificacao_evento
    WHERE user_id = v_user_id AND idempotency_key = v_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'xp_ganho', 0,
      'ja_concedido', true,
      'novas_conquistas', public.verificar_conquistas_usuario(v_user_id),
      'stats', public.get_meu_xp()
    );
  END IF;

  IF v_tentativa.status <> 'finalizada' OR v_tentativa.modo = 'visualizar' THEN
    RETURN jsonb_build_object(
      'xp_ganho', 0,
      'ja_concedido', false,
      'novas_conquistas', '[]'::jsonb,
      'stats', public.get_meu_xp()
    );
  END IF;

  -- XP base: 10 pts por acerto
  v_base := GREATEST(COALESCE(v_tentativa.acertos, 0), 0) * 10;

  -- Bônus por nota
  v_bonus_nota := CASE
    WHEN COALESCE(v_tentativa.nota, 0) >= 70 THEN 50
    WHEN COALESCE(v_tentativa.nota, 0) >= 50 THEN 20
    ELSE 0
  END;

  -- Bônus por tempo (dificuldade removida — coluna não existe mais)
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

  v_xp_calculado := v_base + v_bonus_nota + v_bonus_tempo;

  -- Cap diário de 500 XP por tentativas
  SELECT COALESCE(SUM(xp), 0)::integer
  INTO v_xp_hoje
  FROM public.gamificacao_evento
  WHERE user_id = v_user_id
    AND tipo = 'tentativa'
    AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
        = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_xp_concedido := LEAST(v_xp_calculado, GREATEST(500 - v_xp_hoje, 0));

  INSERT INTO public.gamificacao_evento (user_id, tipo, xp, metadata, idempotency_key)
  VALUES (
    v_user_id, 'tentativa', v_xp_concedido,
    jsonb_build_object(
      'tentativa_id', p_tentativa_id,
      'xp_calculado', v_xp_calculado,
      'base',         v_base,
      'bonus_nota',   v_bonus_nota,
      'bonus_tempo',  v_bonus_tempo
    ),
    v_idempotency_key
  );

  v_novas_conquistas := public.verificar_conquistas_usuario(v_user_id);
  v_stats            := public.get_meu_xp();

  RETURN jsonb_build_object(
    'xp_ganho',         v_xp_concedido,
    'ja_concedido',     false,
    'novas_conquistas', v_novas_conquistas,
    'stats',            v_stats
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.conceder_xp_tentativa(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.conceder_xp_tentativa(uuid) TO authenticated;
