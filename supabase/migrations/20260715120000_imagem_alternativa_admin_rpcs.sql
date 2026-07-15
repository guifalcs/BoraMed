-- Imagens nas alternativas: a coluna alternativa.imagem_url já existe desde o
-- schema inicial e as RPCs de leitura do aluno já a devolvem. Faltavam as duas
-- RPCs do fluxo admin:
--   1. admin_get_questao — o editor de questões não recebia imagem_url das
--      alternativas, então o formulário perderia a imagem ao salvar.
--   2. admin_criar_prova_com_questoes — o INSERT de alternativas descartava
--      imagem_url no fluxo de criação de prova com questões novas.
--   3. get_desafio_diario — as alternativas do desafio não traziam imagem_url.

-- 1) admin_get_questao: incluir imagem_url no jsonb das alternativas.
--    Corpo idêntico ao de 20260618120000, apenas com o campo novo.
CREATE OR REPLACE FUNCTION public.admin_get_questao(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  SELECT to_jsonb(q)
    || jsonb_build_object(
         'prova', (
           SELECT jsonb_build_object('nome', pr.nome)
           FROM public.prova pr WHERE pr.id = q.prova_id
         ),
         'alternativas', (
           SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
             'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem,
             'imagem_url', a.imagem_url
           ) ORDER BY a.ordem), '[]'::jsonb)
           FROM public.alternativa a WHERE a.questao_id = q.id
         ),
         'temas', (
           SELECT coalesce(jsonb_agg(qt.tema_id), '[]'::jsonb)
           FROM public.questao_tema qt WHERE qt.questao_id = q.id
         )
       )
  INTO v_result
  FROM public.questao q
  WHERE q.id = p_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'questao_nao_encontrada' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_result;
END;
$function$;

-- 2) admin_criar_prova_com_questoes: gravar imagem_url das alternativas.
--    Corpo idêntico ao de 20260710120000, apenas com o campo novo no INSERT.
CREATE OR REPLACE FUNCTION public.admin_criar_prova_com_questoes(
  p_prova jsonb,
  p_questoes_novas jsonb DEFAULT '[]'::jsonb,
  p_questoes_existentes uuid[] DEFAULT '{}'::uuid[]
)
RETURNS public.prova
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prova public.prova;
  v_questao_json jsonb;
  v_alternativa jsonb;
  v_tema_id uuid;
  v_faculdade_id uuid;
  v_disciplina_id uuid;
  v_questao_id uuid;
  v_tipo_questao text;
  v_formato text;
  v_qtd_questoes integer := 0;
  v_ordem integer := 0;
  v_existentes uuid[] := array(
    SELECT DISTINCT questao_id
    FROM unnest(coalesce(p_questoes_existentes, '{}'::uuid[])) AS questao_id
  );
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_prova IS NULL OR coalesce(btrim(p_prova ->> 'nome'), '') = '' THEN
    RAISE EXCEPTION 'Nome da prova é obrigatório';
  END IF;

  IF coalesce((p_prova ->> 'periodo')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'Período da prova é inválido';
  END IF;

  IF p_prova ->> 'tipo' NOT IN ('autoral', 'faculdade')
    OR p_prova ->> 'origem' NOT IN ('autoral', 'faculdade')
    OR p_prova ->> 'formato' NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Dados da prova são inválidos';
  END IF;

  IF nullif(p_prova ->> 'faculdade_id', '') IS NOT NULL THEN
    v_faculdade_id := (p_prova ->> 'faculdade_id')::uuid;
  END IF;

  IF jsonb_typeof(coalesce(p_questoes_novas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Questões novas devem ser uma lista';
  END IF;

  IF array_length(v_existentes, 1) IS NOT NULL
    AND (SELECT count(*) FROM public.questao WHERE id = ANY(v_existentes)) <> array_length(v_existentes, 1) THEN
    RAISE EXCEPTION 'Uma ou mais questões selecionadas não estão mais disponíveis';
  END IF;

  IF coalesce(jsonb_array_length(p_questoes_novas), 0) + coalesce(array_length(v_existentes, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione ou importe ao menos uma questão';
  END IF;

  INSERT INTO public.prova (
    nome, tipo, origem, formato, rede, faculdade_id, periodo, subtipo,
    subtipo_nacional, publicada, arquivada, qtd_questoes
  )
  VALUES (
    btrim(p_prova ->> 'nome'),
    p_prova ->> 'tipo',
    p_prova ->> 'origem',
    p_prova ->> 'formato',
    nullif(p_prova ->> 'rede', ''),
    v_faculdade_id,
    (p_prova ->> 'periodo')::integer,
    nullif(p_prova ->> 'subtipo', ''),
    nullif(p_prova ->> 'subtipo_nacional', ''),
    coalesce((p_prova ->> 'publicada')::boolean, false),
    coalesce((p_prova ->> 'arquivada')::boolean, false),
    0
  )
  RETURNING * INTO v_prova;

  FOREACH v_questao_id IN ARRAY v_existentes LOOP
    v_ordem := v_ordem + 1;
    INSERT INTO public.prova_questao (prova_id, questao_id, ordem)
    VALUES (v_prova.id, v_questao_id, v_ordem);
  END LOOP;

  FOR v_questao_json IN SELECT value FROM jsonb_array_elements(coalesce(p_questoes_novas, '[]'::jsonb)) LOOP
    IF coalesce(btrim(v_questao_json ->> 'enunciado'), '') = '' THEN
      RAISE EXCEPTION 'Enunciado da questão é obrigatório';
    END IF;

    v_tipo_questao := coalesce(v_questao_json ->> 'tipo_questao', p_prova ->> 'formato');
    IF v_tipo_questao NOT IN ('nacional', 'processual', 'laboratorio') THEN
      RAISE EXCEPTION 'Tipo de questão inválido';
    END IF;

    v_formato := coalesce(v_questao_json ->> 'formato', 'multipla_escolha');

    IF v_formato = 'resposta_aberta_curta' THEN
      IF coalesce(btrim(v_questao_json ->> 'resposta_modelo'), '') = '' THEN
        RAISE EXCEPTION 'Questão aberta exige resposta modelo';
      END IF;
      IF jsonb_array_length(coalesce(v_questao_json -> 'alternativas', '[]'::jsonb)) > 0 THEN
        RAISE EXCEPTION 'Questão aberta não deve ter alternativas';
      END IF;
    ELSE
      IF jsonb_typeof(coalesce(v_questao_json -> 'alternativas', '[]'::jsonb)) <> 'array'
        OR jsonb_array_length(coalesce(v_questao_json -> 'alternativas', '[]'::jsonb)) < 2
        OR (SELECT count(*) FROM jsonb_array_elements(v_questao_json -> 'alternativas') a WHERE coalesce((a ->> 'correta')::boolean, false)) <> 1 THEN
        RAISE EXCEPTION 'Cada questão deve ter ao menos duas alternativas e um único gabarito';
      END IF;
    END IF;

    IF nullif(v_questao_json ->> 'disciplina_id', '') IS NOT NULL THEN
      v_disciplina_id := (v_questao_json ->> 'disciplina_id')::uuid;
    ELSE
      v_disciplina_id := NULL;
    END IF;

    INSERT INTO public.questao (
      enunciado, enunciado_apoio, imagem_url, imagem_legenda, formato,
      tipo_questao, status, disciplina_id, explicacao, referencia, fonte,
      resposta_modelo, pontos_chave, criterios_correcao, origem_geracao
    )
    VALUES (
      btrim(v_questao_json ->> 'enunciado'),
      nullif(v_questao_json ->> 'enunciado_apoio', ''),
      nullif(v_questao_json ->> 'imagem_url', ''),
      nullif(v_questao_json ->> 'imagem_legenda', ''),
      v_formato,
      v_tipo_questao,
      coalesce(v_questao_json ->> 'status', 'ativa'),
      v_disciplina_id,
      nullif(v_questao_json ->> 'explicacao', ''),
      nullif(v_questao_json ->> 'referencia', ''),
      nullif(v_questao_json ->> 'fonte', ''),
      CASE WHEN v_formato = 'resposta_aberta_curta' THEN nullif(v_questao_json ->> 'resposta_modelo', '') END,
      CASE WHEN v_formato = 'resposta_aberta_curta' THEN coalesce(v_questao_json -> 'pontos_chave', '[]'::jsonb) ELSE '[]'::jsonb END,
      CASE WHEN v_formato = 'resposta_aberta_curta' THEN nullif(v_questao_json ->> 'criterios_correcao', '') END,
      coalesce(v_questao_json ->> 'origem_geracao', 'ia_assistida')
    )
    RETURNING id INTO v_questao_id;

    FOR v_alternativa IN SELECT value FROM jsonb_array_elements(coalesce(v_questao_json -> 'alternativas', '[]'::jsonb)) LOOP
      INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem, imagem_url)
      VALUES (
        v_questao_id,
        v_alternativa ->> 'letra',
        v_alternativa ->> 'texto',
        coalesce((v_alternativa ->> 'correta')::boolean, false),
        coalesce((v_alternativa ->> 'ordem')::integer, 0),
        nullif(v_alternativa ->> 'imagem_url', '')
      );
    END LOOP;

    FOR v_tema_id IN
      SELECT value::uuid
      FROM jsonb_array_elements_text(coalesce(v_questao_json -> 'tema_ids', '[]'::jsonb))
    LOOP
      INSERT INTO public.questao_tema (questao_id, tema_id)
      VALUES (v_questao_id, v_tema_id);
    END LOOP;

    v_ordem := v_ordem + 1;
    INSERT INTO public.prova_questao (prova_id, questao_id, ordem)
    VALUES (v_prova.id, v_questao_id, v_ordem);
  END LOOP;

  v_qtd_questoes := v_ordem;
  UPDATE public.prova
  SET qtd_questoes = v_qtd_questoes
  WHERE id = v_prova.id
  RETURNING * INTO v_prova;

  RETURN v_prova;
END;
$$;

-- 3) get_desafio_diario: incluir imagem_url nas duas agregações de
--    alternativas. Corpo idêntico ao de 20260707160000, só com o campo novo.
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
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.desafio_diario (data, questao_id)
  SELECT v_hoje, q.id
  FROM public.questao q
  LEFT JOIN public.desafio_diario dd ON dd.questao_id = q.id
  WHERE q.apto_desafio_diario = true
    -- D14: discursivas fora do desafio diário (fluxo síncrono não combina
    -- com latência/custo de correção por IA)
    AND q.formato <> 'resposta_aberta_curta'
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
      'mensagem', 'Nenhuma questao disponivel para o desafio de hoje.'
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
          'imagem_legenda', q.imagem_legenda,
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
          'correta', a.correta,
          'imagem_url', a.imagem_url
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
        'imagem_legenda', q.imagem_legenda,
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
        'ordem', a.ordem,
        'imagem_url', a.imagem_url
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

-- NOTA: o filtro "só com imagens" do admin (enunciado OU alternativa) é
-- resolvido no frontend em duas consultas (ids de alternativa com imagem +
-- OR no filtro de questao). Uma coluna computada (função com rowtype) não
-- funciona aqui: referenciar a linha inteira de `questao` exige SELECT em
-- TODAS as colunas, e as de gabarito são revogadas de `authenticated`
-- (20260624125610) — a consulta falharia com permission denied.
