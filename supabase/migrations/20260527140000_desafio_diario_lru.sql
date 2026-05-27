-- Altera a seleção do desafio diário para usar LRU (Least Recently Used).
-- Em vez de ORDER BY random(), priorizamos questões nunca usadas (NULL first)
-- e depois as mais antigas na fila — garantindo que toda a base seja percorrida
-- antes de qualquer repetição.

CREATE OR REPLACE FUNCTION public.get_desafio_diario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_hoje date;
  v_questao_id uuid;
  v_resposta public.desafio_diario_resposta%rowtype;
  v_total integer;
  v_acertos integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- LRU: questões nunca usadas (dd.data IS NULL) aparecem primeiro;
  -- em seguida, as usadas há mais tempo (dd.data ASC);
  -- random() como desempate entre questões empatadas na data mais antiga.
  INSERT INTO public.desafio_diario (data, questao_id)
  SELECT v_hoje, q.id
  FROM public.questao q
  LEFT JOIN public.desafio_diario dd ON dd.questao_id = q.id
  WHERE q.apto_desafio_diario = true
  ORDER BY dd.data ASC NULLS FIRST, random()
  LIMIT 1
  ON CONFLICT (data) DO NOTHING;

  SELECT questao_id
  INTO v_questao_id
  FROM public.desafio_diario
  WHERE data = v_hoje;

  IF v_questao_id IS NULL THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'mensagem', 'Nenhuma questão disponível para o desafio de hoje.'
    );
  END IF;

  SELECT *
  INTO v_resposta
  FROM public.desafio_diario_resposta
  WHERE user_id = v_user_id
    AND data = v_hoje;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE correta = true)::integer
  INTO v_total, v_acertos
  FROM public.desafio_diario_resposta
  WHERE data = v_hoje;

  IF found AND v_resposta.user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'disponivel', true,
      'data', v_hoje,
      'questao', (
        SELECT jsonb_build_object(
          'id', q.id,
          'enunciado', q.enunciado,
          'enunciado_apoio', q.enunciado_apoio,
          'imagem_url', q.imagem_url,
          'disciplina', d.sigla,
          'explicacao', q.explicacao
        )
        FROM public.questao q
        LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
        WHERE q.id = v_questao_id
      ),
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'letra', a.letra,
          'texto', a.texto,
          'ordem', a.ordem,
          'correta', a.correta
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = v_questao_id
      ),
      'minha_resposta', jsonb_build_object(
        'alternativa_id', v_resposta.alternativa_id,
        'correta', v_resposta.correta,
        'xp_ganho', v_resposta.xp_ganho,
        'respondido_em', v_resposta.respondido_em
      ),
      'estatistica', jsonb_build_object(
        'total_responderam', v_total,
        'percentual_acerto', CASE
          WHEN v_total > 0 THEN round((v_acertos::numeric / v_total) * 100)::integer
          ELSE 0
        END
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'disponivel', true,
    'data', v_hoje,
    'questao', (
      SELECT jsonb_build_object(
        'id', q.id,
        'enunciado', q.enunciado,
        'enunciado_apoio', q.enunciado_apoio,
        'imagem_url', q.imagem_url,
        'disciplina', d.sigla
      )
      FROM public.questao q
      LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
      WHERE q.id = v_questao_id
    ),
    'alternativas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'letra', a.letra,
        'texto', a.texto,
        'ordem', a.ordem
      ) ORDER BY a.ordem), '[]'::jsonb)
      FROM public.alternativa a
      WHERE a.questao_id = v_questao_id
    ),
    'minha_resposta', null,
    'estatistica', jsonb_build_object(
      'total_responderam', v_total,
      'percentual_acerto', CASE
        WHEN v_total > 0 THEN round((v_acertos::numeric / v_total) * 100)::integer
        ELSE 0
      END
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_desafio_diario() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_desafio_diario() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_desafio_diario() TO authenticated;
