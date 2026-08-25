-- ============================================================================
-- Helper de manutenção: criação de gêmea discursiva a partir de uma fechada
--
-- Contexto: conversão em lote do acervo NÃO-NACIONAL (processual/laboratório)
-- em gêmeas discursivas, a pedido dos alunos. Cada gêmea:
--   * herda enunciado_apoio, imagem, disciplina, tipo, referência e temas da
--     origem (a imagem é COMPARTILHADA — mesma URL; ver nota de storage abaixo);
--   * recebe resposta_modelo/pontos_chave/criterios/explicação escritos na
--     curadoria (a explicação da fechada comenta alternativa por alternativa em
--     91% dos casos, então NÃO pode ser copiada crua);
--   * mantém o enunciado da origem quando p_enunciado vem NULL — o caso das
--     questões que já são pergunta direta e autocontida;
--   * entra no MESMO grupo_equivalencia_id da origem, carimbando a origem
--     também quando ela ainda não pertencia a nenhum grupo.
--
-- É o grupo de equivalência que garante o que o produto promete: dedup no
-- sorteio (gêmeas nunca no mesmo simulado) e rodízio por questão lógica
-- (ver 20260708130000 e 20260708140000).
--
-- ⚠️ STORAGE: gêmeas de laboratório apontam para o MESMO arquivo de imagem da
-- origem. O guard em AdminService.deletarArquivoStorage impede que apagar/trocar
-- a imagem de uma das duas remova o arquivo enquanto a outra ainda o referencia.
-- Não reverter esse guard sem antes duplicar os arquivos no bucket.
--
-- Função de MANUTENÇÃO: sem GRANT para anon/authenticated. Só postgres e
-- service_role executam. Não é chamada pelo app.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`.
-- ============================================================================

create or replace function public.admin_criar_gemea_discursiva(
  p_origem_id          uuid,
  p_enunciado          text,
  p_resposta_modelo    text,
  p_pontos_chave       jsonb,
  p_criterios_correcao text,
  p_explicacao         text
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_origem    public.questao%rowtype;
  v_enunciado text;
  v_grupo     uuid;
  v_nova      uuid;
BEGIN
  SELECT * INTO v_origem FROM public.questao WHERE id = p_origem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questao de origem % nao encontrada', p_origem_id;
  END IF;

  IF v_origem.formato = 'resposta_aberta_curta' THEN
    RAISE EXCEPTION 'Questao de origem % ja e discursiva', p_origem_id;
  END IF;

  -- NULL = a pergunta da fechada já é autocontida e vale como discursiva.
  v_enunciado := coalesce(nullif(trim(p_enunciado), ''), v_origem.enunciado);

  IF coalesce(trim(p_resposta_modelo), '') = '' THEN
    RAISE EXCEPTION 'resposta_modelo e obrigatoria na gemea de %', p_origem_id;
  END IF;

  IF jsonb_typeof(coalesce(p_pontos_chave, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_pontos_chave, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'pontos_chave deve ser array nao-vazio na gemea de %', p_origem_id;
  END IF;

  v_grupo := coalesce(v_origem.grupo_equivalencia_id, gen_random_uuid());

  -- Idempotência: reexecutar o lote não duplica gêmeas.
  IF EXISTS (
    SELECT 1 FROM public.questao q
    WHERE q.grupo_equivalencia_id = v_grupo
      AND q.formato = 'resposta_aberta_curta'
      AND q.status <> 'deletada'
  ) THEN
    RAISE EXCEPTION 'Grupo % ja possui gemea discursiva', v_grupo;
  END IF;

  UPDATE public.questao
     SET grupo_equivalencia_id = v_grupo
   WHERE id = p_origem_id
     AND grupo_equivalencia_id IS DISTINCT FROM v_grupo;

  INSERT INTO public.questao (
    enunciado_apoio, enunciado, imagem_url, imagem_legenda, formato,
    explicacao, explicacao_original, referencia, fonte, status,
    origem_geracao, nivel_bloom, formato_prova, apto_desafio_diario,
    disciplina_id, tipo_questao, resposta_modelo, pontos_chave,
    criterios_correcao, grupo_equivalencia_id, revisao_conversao, autor_id
  )
  VALUES (
    v_origem.enunciado_apoio, v_enunciado, v_origem.imagem_url, v_origem.imagem_legenda,
    'resposta_aberta_curta',
    p_explicacao, v_origem.explicacao, v_origem.referencia, v_origem.fonte, 'ativa',
    'ia_assistida', v_origem.nivel_bloom, v_origem.formato_prova, false,
    v_origem.disciplina_id, v_origem.tipo_questao, p_resposta_modelo, p_pontos_chave,
    p_criterios_correcao, v_grupo, 'pendente', v_origem.autor_id
  )
  RETURNING id INTO v_nova;

  -- Sem os temas da origem a gêmea fica invisível para quem filtra por tema
  -- na tela de montar simulado.
  INSERT INTO public.questao_tema (questao_id, tema_id, principal)
  SELECT v_nova, qt.tema_id, qt.principal
  FROM public.questao_tema qt
  WHERE qt.questao_id = p_origem_id;

  RETURN v_nova;
END;
$$;

comment on function public.admin_criar_gemea_discursiva(uuid, text, text, jsonb, text, text) is
  'Manutenção: cria a gêmea discursiva de uma questão fechada, no mesmo grupo de equivalência (carimbando a origem se preciso) e herdando temas/imagem. p_enunciado NULL mantem o enunciado da origem. Idempotente por grupo. Sem grant para anon/authenticated.';

revoke all on function public.admin_criar_gemea_discursiva(uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
