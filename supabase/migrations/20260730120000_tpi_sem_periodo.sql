-- TPI (teste de progresso) é aplicada a todos os períodos ao mesmo tempo: amarrá-la
-- a um período específico é errado e faz a prova sumir do filtro dos alunos dos
-- demais períodos. `periodo` passa a aceitar NULL, e o CHECK torna a regra exclusiva:
-- TPI sempre sem período, qualquer outra prova sempre com período.
--
-- Provas personalizadas continuam com periodo = 0 (sentinela já usada por
-- `origem = 'personalizado'`), portanto não são afetadas.

ALTER TABLE public.prova ALTER COLUMN periodo DROP NOT NULL;

ALTER TABLE public.prova DROP CONSTRAINT IF EXISTS prova_periodo_tpi_check;

-- coalesce com '' evita que o CHECK vire NULL (e passe silenciosamente) quando
-- ambos os subtipos são nulos.
ALTER TABLE public.prova
  ADD CONSTRAINT prova_periodo_tpi_check CHECK (
    (coalesce(subtipo, subtipo_nacional, '') = 'teste_progresso') = (periodo IS NULL)
  );

-- ── RPC de criação: TPI grava periodo/disciplina nulos em vez de exigir período ──
CREATE OR REPLACE FUNCTION public.admin_criar_prova_com_questoes(
  p_prova jsonb,
  p_questoes_novas jsonb DEFAULT '[]'::jsonb,
  p_questoes_existentes uuid[] DEFAULT '{}'::uuid[]
)
 RETURNS prova
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prova public.prova;
  v_questao_json jsonb;
  v_alternativa jsonb;
  v_tema_id uuid;
  v_faculdade_id uuid;
  v_prova_disciplina_id uuid;
  v_disciplina_id uuid;
  v_questao_id uuid;
  v_tipo_questao text;
  v_formato text;
  v_periodo integer;
  v_eh_tpi boolean;
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

  v_eh_tpi := coalesce(p_prova ->> 'subtipo', p_prova ->> 'subtipo_nacional', '') = 'teste_progresso';

  -- TPI vale para todos os períodos: grava NULL e ignora o que veio no payload.
  IF v_eh_tpi THEN
    v_periodo := NULL;
  ELSIF coalesce((p_prova ->> 'periodo')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'Período da prova é inválido';
  ELSE
    v_periodo := (p_prova ->> 'periodo')::integer;
  END IF;

  IF p_prova ->> 'tipo' NOT IN ('autoral', 'faculdade')
    OR p_prova ->> 'origem' NOT IN ('autoral', 'faculdade')
    OR p_prova ->> 'formato' NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Dados da prova são inválidos';
  END IF;

  IF nullif(p_prova ->> 'faculdade_id', '') IS NOT NULL THEN
    v_faculdade_id := (p_prova ->> 'faculdade_id')::uuid;
  END IF;

  -- Sem período não há matéria única: uma disciplina residual vazaria no filtro
  -- de matéria dos alunos.
  IF NOT v_eh_tpi AND nullif(p_prova ->> 'disciplina_id', '') IS NOT NULL THEN
    v_prova_disciplina_id := (p_prova ->> 'disciplina_id')::uuid;
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
    subtipo_nacional, publicada, arquivada, qtd_questoes, disciplina_id
  )
  VALUES (
    btrim(p_prova ->> 'nome'),
    p_prova ->> 'tipo',
    p_prova ->> 'origem',
    p_prova ->> 'formato',
    nullif(p_prova ->> 'rede', ''),
    v_faculdade_id,
    v_periodo,
    nullif(p_prova ->> 'subtipo', ''),
    nullif(p_prova ->> 'subtipo_nacional', ''),
    coalesce((p_prova ->> 'publicada')::boolean, false),
    coalesce((p_prova ->> 'arquivada')::boolean, false),
    0,
    v_prova_disciplina_id
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
$function$;
