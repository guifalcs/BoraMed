-- Segurança CRÍTICO 1 — fechar o vazamento do gabarito.
--
-- Política definida: gabarito/explicação são SEGREDO até o aluno finalizar uma
-- tentativa da prova (admin vê sempre). Revogamos a leitura direta das colunas
-- de resposta de `authenticated`/`anon` (fecha REST e GraphQL, inclusive durante
-- simulado) e servimos a revisão e o editor admin por RPCs SECURITY DEFINER.
--
-- As RPCs de execução (iniciar/gerar/retomar/finalizar) são definer e seguem
-- funcionando — já mascaram `correta` no modo simulado.

-- 1) Esconder as colunas de resposta de `authenticated` (anon já não tem SELECT
--    nessas tabelas). REVOKE de coluna não funciona enquanto existe SELECT a
--    nível de tabela, então revogamos o SELECT da tabela e concedemos SELECT
--    apenas nas colunas seguras.
REVOKE SELECT ON public.alternativa FROM authenticated;
GRANT  SELECT (id, questao_id, letra, texto, ordem, imagem_url)
  ON public.alternativa TO authenticated;

REVOKE SELECT ON public.questao FROM authenticated;
GRANT  SELECT (
  id, prova_id, ordem_na_prova, codigo_externo, enunciado_apoio, enunciado,
  imagem_url, imagem_legenda, formato, referencia, fonte, vezes_respondida,
  vezes_acertada, taxa_acerto, status, revisado, criado_em, atualizado_em,
  autor_id, revisor_id, aprovada_em, publicada_em, origem_geracao, nivel_bloom,
  formato_prova, apto_desafio_diario, disciplina_id, tipo_questao
) ON public.questao TO authenticated;

-- 2) RPC de revisão do aluno: só devolve o gabarito de uma prova que o usuário
--    já FINALIZOU (admin pode revisar qualquer prova).
CREATE OR REPLACE FUNCTION public.get_revisao_prova(p_prova_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_tentativa_id uuid;
  v_questoes jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_is_admin := public.is_admin(v_user_id);

  SELECT t.id
  INTO v_tentativa_id
  FROM public.tentativa t
  WHERE t.user_id = v_user_id
    AND t.prova_id = p_prova_id
    AND t.status = 'finalizada'
    AND t.modo <> 'visualizar'
  ORDER BY t.finalizada_em DESC NULLS LAST, t.criado_em DESC
  LIMIT 1;

  IF v_tentativa_id IS NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Revisao disponivel apenas apos finalizar a prova' USING ERRCODE = 'P0005';
  END IF;

  IF v_tentativa_id IS NOT NULL THEN
    -- Questões da tentativa do usuário (cobre provas regulares e personalizadas)
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prova_id', p_prova_id,
        'ordem_na_prova', coalesce(tr.ordem_na_tentativa, q.ordem_na_prova),
        'codigo_externo', q.codigo_externo,
        'enunciado_apoio', q.enunciado_apoio,
        'enunciado', q.enunciado,
        'imagem_url', q.imagem_url,
        'imagem_legenda', q.imagem_legenda,
        'formato', q.formato,
        'explicacao', q.explicacao,
        'referencia', q.referencia,
        'disciplina', d.sigla,
        'periodo', d.periodo::integer,
        'status', q.status,
        'criado_em', q.criado_em,
        'atualizado_em', q.atualizado_em,
        'alternativas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
            'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url
          ) ORDER BY a.ordem), '[]'::jsonb)
          FROM public.alternativa a WHERE a.questao_id = q.id
        ),
        'temas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
            'disciplina', td.sigla, 'periodo', td.periodo::integer,
            'parent_id', t.parent_id, 'criado_em', t.criado_em
          ) ORDER BY t.nome), '[]'::jsonb)
          FROM public.questao_tema qt
          JOIN public.tema t ON t.id = qt.tema_id
          LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
          WHERE qt.questao_id = q.id
        )
      )
      ORDER BY coalesce(tr.ordem_na_tentativa, q.ordem_na_prova, 2147483647), tr.id
    )
    INTO v_questoes
    FROM public.tentativa_resposta tr
    JOIN public.questao q ON q.id = tr.questao_id
    LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
    WHERE tr.tentativa_id = v_tentativa_id;
  ELSE
    -- Admin sem tentativa: questões ativas da prova
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prova_id', p_prova_id,
        'ordem_na_prova', pq.ordem,
        'codigo_externo', q.codigo_externo,
        'enunciado_apoio', q.enunciado_apoio,
        'enunciado', q.enunciado,
        'imagem_url', q.imagem_url,
        'imagem_legenda', q.imagem_legenda,
        'formato', q.formato,
        'explicacao', q.explicacao,
        'referencia', q.referencia,
        'disciplina', d.sigla,
        'periodo', d.periodo::integer,
        'status', q.status,
        'criado_em', q.criado_em,
        'atualizado_em', q.atualizado_em,
        'alternativas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'questao_id', a.questao_id, 'letra', a.letra,
            'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem, 'imagem_url', a.imagem_url
          ) ORDER BY a.ordem), '[]'::jsonb)
          FROM public.alternativa a WHERE a.questao_id = q.id
        ),
        'temas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'nome', t.nome, 'disciplina_id', t.disciplina_id,
            'disciplina', td.sigla, 'periodo', td.periodo::integer,
            'parent_id', t.parent_id, 'criado_em', t.criado_em
          ) ORDER BY t.nome), '[]'::jsonb)
          FROM public.questao_tema qt
          JOIN public.tema t ON t.id = qt.tema_id
          LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
          WHERE qt.questao_id = q.id
        )
      )
      ORDER BY pq.ordem, q.id
    )
    INTO v_questoes
    FROM public.prova_questao pq
    JOIN public.questao q ON q.id = pq.questao_id
    LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
    WHERE pq.prova_id = p_prova_id
      AND q.status = 'ativa';
  END IF;

  RETURN jsonb_build_object('questoes', coalesce(v_questoes, '[]'::jsonb));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_revisao_prova(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_revisao_prova(uuid) TO authenticated;

-- 3) RPC do editor admin: devolve a questão completa (com colunas de resposta),
--    alternativas (com `correta`) e ids de temas. Valida is_admin().
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
             'texto', a.texto, 'correta', a.correta, 'ordem', a.ordem
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

REVOKE EXECUTE ON FUNCTION public.admin_get_questao(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_questao(uuid) TO authenticated;
