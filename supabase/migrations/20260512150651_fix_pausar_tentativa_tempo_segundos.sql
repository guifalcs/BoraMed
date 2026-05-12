-- Adiciona p_tempo_segundos à pausar_tentativa para persistir o cronômetro
-- quando o usuário sai da tela da prova sem finalizar.
-- Também torna o erro de "já finalizada" silencioso (RETURN em vez de RAISE)
-- para o fire-and-forget do ngOnDestroy não gerar erros desnecessários.

CREATE OR REPLACE FUNCTION public.pausar_tentativa(
  p_tentativa_id   uuid,
  p_tempo_segundos int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_tentativa RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tentativa
  FROM tentativa
  WHERE id = p_tentativa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada ou sem permissão' USING ERRCODE = 'P0003';
  END IF;

  IF v_tentativa.status = 'finalizada' THEN
    RETURN; -- já finalizada, ignora silenciosamente
  END IF;

  UPDATE tentativa
  SET status                   = 'pausada',
      pausada_em               = NOW(),
      tempo_acumulado_segundos = COALESCE(p_tempo_segundos, tempo_acumulado_segundos)
  WHERE id = p_tentativa_id;
END;
$function$;
