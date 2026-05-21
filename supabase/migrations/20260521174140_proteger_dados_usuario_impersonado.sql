-- Garante que respostas sejam gravadas apenas na tentativa do usuario autenticado.
-- Isso evita que sessoes administrativas ou incorporadas salvem dados em tentativas de outro usuario.

CREATE OR REPLACE FUNCTION public.salvar_resposta_tentativa(
  p_tentativa_id uuid,
  p_questao_id uuid,
  p_alternativa_id uuid
)
RETURNS public.tentativa_resposta
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_resposta public.tentativa_resposta;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tentativa t
    WHERE t.id = p_tentativa_id
      AND t.user_id = v_user_id
      AND t.status <> 'finalizada'
  ) THEN
    RAISE EXCEPTION 'Tentativa nao encontrada, finalizada ou sem permissao' USING ERRCODE = 'P0003';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.alternativa a
    WHERE a.id = p_alternativa_id
      AND a.questao_id = p_questao_id
  ) THEN
    RAISE EXCEPTION 'Alternativa invalida para a questao' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.tentativa_resposta tr
  SET alternativa_id = p_alternativa_id,
      respondida_em = now()
  WHERE tr.tentativa_id = p_tentativa_id
    AND tr.questao_id = p_questao_id
  RETURNING * INTO v_resposta;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resposta nao encontrada para a tentativa' USING ERRCODE = 'P0005';
  END IF;

  RETURN v_resposta;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.salvar_resposta_tentativa(uuid, uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.salvar_resposta_tentativa(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.salvar_resposta_tentativa(uuid, uuid, uuid) TO authenticated;
