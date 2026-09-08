-- =============================================================================
-- Plano gratuito passa a montar simulado — cota de 3 vira 2 + 1
-- =============================================================================
-- Antes: `montar simulado` era exclusivo do Avançado. `gerar_simulado_personalizado`
-- barrava o gratuito com P0009 (tem_assinatura_ativa) e o essencial com P0015,
-- e a rota /dashboard/simulados/montar tinha o tierAvancadoGuard.
--
-- Agora o gratuito monta, e o teto vitalício de 3 tentativas deixa de ser um
-- balde único: vira DOIS baldes, para o grátis provar as duas experiências sem
-- gastar tudo numa só.
--
--   nacional (treino PRONTO, via iniciar_tentativa)          -> 2
--   montado  (via gerar_simulado_personalizado)              -> 1
--   -------------------------------------------------------------
--   limite_tentativas_gratuitas() = soma dos dois            -> 3  (inalterado)
--
-- O balde do montado é uma bala de prata: uma única geração, com o acervo
-- inteiro (nacional + processual + laboratório, fechadas ou discursivas).
-- Decisão de produto do Guilherme, ciente de que isso deixa o gratuito com um
-- recurso que o Essencial não tem — o que separa os dois é o teto de
-- tentativas, não o catálogo.
--
-- ⚠️ O Essencial CONTINUA bloqueado no montador (P0015). Não foi esquecimento.
--
-- Como os baldes são medidos: `prova.origem = 'personalizado'` marca a prova
-- sintética que só `gerar_simulado_personalizado` cria. Os conjuntos são
-- disjuntos por construção — prova personalizada não tem linha em
-- `prova_questao`, então `iniciar_tentativa` nunca a aceita (P0004).
--
-- O cap global de 3 continua valendo por cima dos baldes (`least(...)` em cada
-- contador). Sem ele, uma conta legada que já queimou 3 tentativas nacionais
-- ganharia uma 4ª de brinde ao estrear o montador. Com ele, quem já bateu no
-- teto continua bloqueado nos dois caminhos.
--
-- `listar_temas_com_contagem` vira SECURITY DEFINER: era SECURITY INVOKER e o
-- RLS de `questao` exige `tem_assinatura_ativa()`, então a tela de montar
-- abriria com 0 questões em TODO tema para o gratuito — e o botão desabilitado.
-- A função devolve só contagem agregada por tema, nunca conteúdo de questão.
--
-- Bases usadas (versão vigente antes desta migration):
--   - iniciar_tentativa: 20260810184003_free_tier_visualizar_exige_prova_finalizada.sql
--   - gerar_simulado_personalizado: 20260722150000_questao_recurso_e_anulacao.sql
--   - tentativas_gratuitas_restantes / get_status_acesso: 20260801115817
--   - listar_temas_com_contagem: 20260707170000 (formato_questao)
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar via `db pull`/`db diff`. Os
-- REVOKE/GRANT do fim do arquivo foram escritos à mão; o `db pull` não os emite
-- e as funções novas nasceriam com EXECUTE para PUBLIC/anon. Mesma regressão
-- documentada em 20260624131517 e 20260801115817.
-- =============================================================================

set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- 1) Limites por balde. O total passa a ser DERIVADO, não uma terceira
--    constante solta que poderia divergir da soma.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas_nacional()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 2;
$function$
;

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas_montado()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public.limite_tentativas_gratuitas_nacional()
       + public.limite_tentativas_gratuitas_montado();
$function$
;

-- ----------------------------------------------------------------------------
-- 2) Consumo por balde. Helper interno: NÃO recebe grant para `authenticated`,
--    porque não tem a trava de "só o próprio uid" — quem chama é sempre outra
--    função SECURITY DEFINER, que já validou o uid.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tentativas_gratuitas_usadas(uid uuid DEFAULT auth.uid())
 RETURNS TABLE(nacional integer, montado integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    count(*) FILTER (WHERE p.origem IS DISTINCT FROM 'personalizado')::integer,
    count(*) FILTER (WHERE p.origem = 'personalizado')::integer
  FROM public.tentativa t
  LEFT JOIN public.prova p ON p.id = t.prova_id
  WHERE t.user_id = uid
    AND t.modo <> 'visualizar';
$function$
;

CREATE OR REPLACE FUNCTION public.tentativas_gratuitas_restantes_nacional(uid uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN uid IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN 0
    WHEN public.nivel_acesso(uid) <> 'gratuito' THEN NULL
    ELSE (
      SELECT greatest(0, least(
        public.limite_tentativas_gratuitas_nacional() - u.nacional,
        public.limite_tentativas_gratuitas() - (u.nacional + u.montado)
      ))
      FROM public.tentativas_gratuitas_usadas(uid) u
    )
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.tentativas_gratuitas_restantes_montado(uid uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN uid IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN 0
    WHEN public.nivel_acesso(uid) <> 'gratuito' THEN NULL
    ELSE (
      SELECT greatest(0, least(
        public.limite_tentativas_gratuitas_montado() - u.montado,
        public.limite_tentativas_gratuitas() - (u.nacional + u.montado)
      ))
      FROM public.tentativas_gratuitas_usadas(uid) u
    )
  END;
$function$
;

-- Saldo TOTAL = soma dos baldes. Mantém o contrato usado pelo banner de
-- tentativas e por get_status_acesso, e nunca passa do cap global de 3.
CREATE OR REPLACE FUNCTION public.tentativas_gratuitas_restantes(uid uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN uid IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN 0
    WHEN public.nivel_acesso(uid) <> 'gratuito' THEN NULL
    ELSE coalesce(public.tentativas_gratuitas_restantes_nacional(uid), 0)
       + coalesce(public.tentativas_gratuitas_restantes_montado(uid), 0)
  END;
$function$
;

-- ----------------------------------------------------------------------------
-- 3) get_status_acesso — expõe os dois baldes para a UI decidir o que mostrar
--    (card de montar bloqueado ou não, copy do banner) sem uma segunda RPC.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_status_acesso()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'nivel', public.nivel_acesso(),
    'tentativas_limite', public.limite_tentativas_gratuitas(),
    'tentativas_restantes', public.tentativas_gratuitas_restantes(),
    'tentativas_usadas', CASE
      WHEN public.nivel_acesso() <> 'gratuito' THEN NULL
      ELSE public.limite_tentativas_gratuitas() - public.tentativas_gratuitas_restantes()
    END,
    'nacional_limite', public.limite_tentativas_gratuitas_nacional(),
    'nacional_restantes', public.tentativas_gratuitas_restantes_nacional(),
    'montado_limite', public.limite_tentativas_gratuitas_montado(),
    'montado_restantes', public.tentativas_gratuitas_restantes_montado()
  );
$function$
;

-- ----------------------------------------------------------------------------
-- 4) listar_temas_com_contagem — SECURITY DEFINER (ver cabeçalho). Corpo
--    idêntico ao vigente; só muda o modo de execução.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_temas_com_contagem(p_tipo_questao text DEFAULT NULL::text, p_formato_questao text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, disciplina_id uuid, disciplina text, periodo integer, parent_id uuid, criado_em timestamp with time zone, qtd_questoes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    t.id,
    t.nome,
    t.disciplina_id,
    dq.sigla   AS disciplina,
    dq.periodo::int AS periodo,
    t.parent_id,
    t.criado_em,
    COUNT(q.id) AS qtd_questoes
  FROM tema t
  LEFT JOIN disciplina dq ON dq.id = t.disciplina_id
  LEFT JOIN questao_tema qt ON qt.tema_id = t.id
  LEFT JOIN questao q
    ON  q.id = qt.questao_id
    AND q.status = 'ativa'
    AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
    -- Espelha o filtro de formato do gerar_simulado_personalizado
    AND (
      p_formato_questao IS NULL
      OR (p_formato_questao = 'fechadas' AND q.formato <> 'resposta_aberta_curta')
      OR (p_formato_questao = 'discursivas' AND q.formato = 'resposta_aberta_curta')
      OR p_formato_questao = 'misto'
    )
  WHERE (
    p_tipo_questao IS NULL
    OR t.tipos_prova IS NULL
    OR p_tipo_questao = ANY(t.tipos_prova)
  )
  GROUP BY t.id, t.nome, t.disciplina_id, dq.sigla, dq.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$function$
;

-- ----------------------------------------------------------------------------
-- 5) iniciar_tentativa — passa a debitar do balde nacional.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.iniciar_tentativa(p_prova_id uuid, p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_prova record;
  v_tentativa record;
  v_questoes jsonb;
  v_nivel text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo', 'visualizar') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  SELECT p.*, count(pq.questao_id) FILTER (WHERE q.status = 'ativa') AS total
  INTO v_prova
  FROM public.prova p
  LEFT JOIN public.prova_questao pq ON pq.prova_id = p.id
  LEFT JOIN public.questao q ON q.id = pq.questao_id
  WHERE p.id = p_prova_id
  GROUP BY p.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova nao encontrada' USING ERRCODE = 'P0003';
  END IF;

  IF v_prova.total = 0 THEN
    RAISE EXCEPTION 'A prova nao possui questoes ativas' USING ERRCODE = 'P0004';
  END IF;

  v_nivel := public.nivel_acesso();

  -- Gratuito e essencial só acessam treinos de formato nacional.
  IF v_nivel IN ('gratuito', 'essencial') AND v_prova.formato IS DISTINCT FROM 'nacional' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
  END IF;

  -- Teto do plano gratuito para treino PRONTO (bucket nacional, hoje 2 das 3
  -- tentativas). Debita ao iniciar, sem estorno; retomar uma tentativa pausada
  -- usa outra RPC e por isso nunca debita de novo. O crédito de simulado
  -- montado é separado e vive em gerar_simulado_personalizado.
  IF v_nivel = 'gratuito'
     AND p_modo <> 'visualizar'
     AND public.tentativas_gratuitas_restantes_nacional() <= 0 THEN
    RAISE EXCEPTION 'free_limit_reached: limite de tentativas do plano gratuito atingido' USING ERRCODE = 'P0016';
  END IF;

  -- Modo visualizar entrega gabarito, explicacoes e resposta modelo sem debitar
  -- credito. No plano gratuito isso so vale para prova que o aluno JA finalizou
  -- — mesma regra de get_revisao_prova (P0005) e do v_liberado de
  -- get_simulado_impressao. Sem esta trava, uma conta gratuita mesmo esgotada
  -- extraia o acervo nacional inteiro COM gabarito, sem limite, chamando a RPC
  -- direto. A UI nunca usa este caminho: a revisao vai por get_revisao_prova.
  IF v_nivel = 'gratuito'
     AND p_modo = 'visualizar'
     AND NOT EXISTS (
       SELECT 1
       FROM public.tentativa t
       WHERE t.user_id = v_user_id
         AND t.prova_id = p_prova_id
         AND t.status = 'finalizada'
         AND t.modo <> 'visualizar'
     ) THEN
    RAISE EXCEPTION 'Revisao disponivel apenas apos finalizar a prova' USING ERRCODE = 'P0005';
  END IF;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, p_prova_id, p_modo, 'em_andamento', v_prova.total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, q.id, row_number() OVER (ORDER BY pq.ordem, q.id)::integer
  FROM public.prova_questao pq
  JOIN public.questao q ON q.id = pq.questao_id
  WHERE pq.prova_id = p_prova_id
    AND q.status = 'ativa'
  ORDER BY pq.ordem, q.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', p_prova_id,
      'ordem_na_prova', tr.ordem_na_tentativa,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN p_modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
      'recurso_texto', q.recurso_texto,
      'anulada', q.anulada,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY tr.ordem_na_tentativa
  )
  INTO v_questoes
  FROM public.tentativa_resposta tr
  JOIN public.questao q ON q.id = tr.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id
  WHERE tr.tentativa_id = v_tentativa.id;

  RETURN jsonb_build_object(
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$


;

-- ----------------------------------------------------------------------------
-- 6) gerar_simulado_personalizado — gratuito entra, essencial continua fora.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gerar_simulado_personalizado(p_tema_ids uuid[] DEFAULT NULL::uuid[], p_qtd integer DEFAULT 10, p_modo text DEFAULT 'simulado'::text, p_tipo_questao text DEFAULT NULL::text, p_formato text DEFAULT NULL::text, p_formato_questao text DEFAULT 'fechadas'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_prova_id uuid;
  v_tentativa record;
  v_questoes jsonb;
  v_total integer;
  v_nome text;
  v_selected_ids uuid[];
  v_nivel text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
  END IF;

  v_nivel := public.nivel_acesso();

  -- Essencial continua fora: o plano vende o acervo nacional PRONTO, e o
  -- montador sorteia de todo o acervo. Gratuito passa a entrar, gastando o
  -- crédito único de simulado montado (bucket separado do nacional).
  IF v_nivel = 'essencial' THEN
    RAISE EXCEPTION 'tier_upgrade_required: recurso disponivel apenas no plano Avancado' USING ERRCODE = 'P0015';
  END IF;

  IF v_nivel = 'gratuito' AND public.tentativas_gratuitas_restantes_montado() <= 0 THEN
    RAISE EXCEPTION 'free_limit_reached: limite de tentativas do plano gratuito atingido' USING ERRCODE = 'P0016';
  END IF;

  IF p_modo NOT IN ('simulado', 'estudo') THEN
    RAISE EXCEPTION 'Modo invalido: %', p_modo USING ERRCODE = 'P0002';
  END IF;

  IF p_qtd < 1 OR p_qtd > 50 THEN
    RAISE EXCEPTION 'Quantidade deve ser entre 1 e 50' USING ERRCODE = 'P0006';
  END IF;

  IF p_tipo_questao IS NOT NULL AND p_tipo_questao NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Tipo de questao invalido: %', p_tipo_questao USING ERRCODE = 'P0007';
  END IF;

  IF p_formato IS NOT NULL AND p_formato NOT IN ('nacional', 'processual', 'laboratorio') THEN
    RAISE EXCEPTION 'Formato invalido: %', p_formato USING ERRCODE = 'P0008';
  END IF;

  IF p_formato_questao NOT IN ('fechadas', 'discursivas', 'misto') THEN
    RAISE EXCEPTION 'Formato de questao invalido: %', p_formato_questao USING ERRCODE = 'P0010';
  END IF;

  SELECT array(
    WITH grupos_entregues AS (
      SELECT DISTINCT coalesce(q2.grupo_equivalencia_id, q2.id) AS grupo
      FROM public.tentativa t
      JOIN public.tentativa_resposta tr ON tr.tentativa_id = t.id
      JOIN public.questao q2 ON q2.id = tr.questao_id
      WHERE t.user_id = v_user_id
        AND t.modo <> 'visualizar'
    ),
    candidatas AS (
      SELECT q.id, coalesce(q.grupo_equivalencia_id, q.id) AS grupo
      FROM public.questao q
      WHERE q.status = 'ativa'
        AND (
          (p_formato_questao = 'fechadas' AND q.formato <> 'resposta_aberta_curta')
          OR (p_formato_questao = 'discursivas' AND q.formato = 'resposta_aberta_curta')
          OR p_formato_questao = 'misto'
        )
        AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
        AND (p_tipo_questao IS DISTINCT FROM 'laboratorio' OR q.imagem_url IS NOT NULL)
        AND (
          p_formato IS NULL
          OR p_formato = 'laboratorio'
          OR q.formato_prova IS NULL
          OR q.formato_prova = p_formato
          OR (q.formato_prova IN ('N1', 'N2', 'teste_progresso', 'integradora') AND p_formato = 'nacional')
        )
        AND (
          p_tema_ids IS NULL
          OR array_length(p_tema_ids, 1) IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.questao_tema qt
            WHERE qt.questao_id = q.id
              AND qt.tema_id = ANY(p_tema_ids)
          )
        )
    ),
    por_grupo AS (
      SELECT c.id,
             (ge.grupo IS NOT NULL) AS entregue,
             row_number() OVER (PARTITION BY c.grupo ORDER BY random()) AS rn
      FROM candidatas c
      LEFT JOIN grupos_entregues ge ON ge.grupo = c.grupo
    )
    SELECT id
    FROM por_grupo
    WHERE rn = 1
    ORDER BY entregue ASC, random()
    LIMIT p_qtd
  )
  INTO v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := CASE
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
      WHEN p_formato_questao = 'discursivas' THEN 'Simulado discursivo - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado - '
    END || string_agg(t.nome, ', ' ORDER BY t.nome) || ' - ' || v_total || 'q'
    INTO v_nome
    FROM public.tema t
    WHERE t.id = ANY(p_tema_ids);
  END IF;

  IF length(v_nome) > 200 THEN
    v_nome := left(v_nome, 197) || '...';
  END IF;

  INSERT INTO public.prova (
    faculdade_id, nome, periodo, tipo, origem, formato, rede, subtipo,
    qtd_questoes, publicada, arquivada
  )
  VALUES (
    NULL, v_nome, 0, 'autoral', 'personalizado', p_formato, NULL, NULL,
    v_total, FALSE, FALSE
  )
  RETURNING id INTO v_prova_id;

  INSERT INTO public.tentativa (
    user_id, prova_id, modo, status, total_questoes, total_respondidas,
    acertos, iniciada_em, criado_em
  )
  VALUES (
    v_user_id, v_prova_id, p_modo, 'em_andamento', v_total, 0,
    0, now(), now()
  )
  RETURNING * INTO v_tentativa;

  INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, ordem_na_tentativa)
  SELECT v_tentativa.id, selected.questao_id, selected.ordem::integer
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prova_id', v_prova_id,
      'ordem_na_prova', selected.ordem::integer,
      'codigo_externo', q.codigo_externo,
      'enunciado_apoio', q.enunciado_apoio,
      'enunciado', q.enunciado,
      'imagem_url', q.imagem_url,
      'imagem_legenda', q.imagem_legenda,
      'formato', q.formato,
      'tipo_questao', q.tipo_questao,
      'explicacao', q.explicacao,
      'referencia', q.referencia,
      'resposta_modelo', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.resposta_modelo END,
      'pontos_chave', CASE WHEN p_modo = 'simulado' THEN '[]'::jsonb ELSE coalesce(q.pontos_chave, '[]'::jsonb) END,
      'criterios_correcao', CASE WHEN p_modo = 'simulado' THEN NULL ELSE q.criterios_correcao END,
      'recurso_texto', q.recurso_texto,
      'anulada', q.anulada,
      'disciplina', d.sigla,
      'periodo', d.periodo::integer,
      'status', q.status,
      'criado_em', q.criado_em,
      'atualizado_em', q.atualizado_em,
      'alternativas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'questao_id', a.questao_id,
          'letra', a.letra,
          'texto', a.texto,
          'correta', CASE WHEN p_modo = 'simulado' THEN NULL ELSE a.correta END,
          'ordem', a.ordem,
          'imagem_url', a.imagem_url
        ) ORDER BY a.ordem), '[]'::jsonb)
        FROM public.alternativa a
        WHERE a.questao_id = q.id
      ),
      'temas', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'nome', t.nome,
          'disciplina_id', t.disciplina_id,
          'disciplina', td.sigla,
          'periodo', td.periodo::integer,
          'parent_id', t.parent_id,
          'criado_em', t.criado_em
        ) ORDER BY t.nome), '[]'::jsonb)
        FROM public.questao_tema qt
        JOIN public.tema t ON t.id = qt.tema_id
        LEFT JOIN public.disciplina td ON td.id = t.disciplina_id
        WHERE qt.questao_id = q.id
      )
    )
    ORDER BY selected.ordem
  )
  INTO v_questoes
  FROM unnest(v_selected_ids) WITH ORDINALITY AS selected(questao_id, ordem)
  JOIN public.questao q ON q.id = selected.questao_id
  LEFT JOIN public.disciplina d ON d.id = q.disciplina_id;

  RETURN jsonb_build_object(
    'prova_id', v_prova_id,
    'tentativa', row_to_json(v_tentativa)::jsonb,
    'questoes', coalesce(v_questoes, '[]'::jsonb)
  );
END;
$function$


;

------------------------------------------------------------------------------
-- Grants e comentários (não emitidos pelo `db pull` — ver aviso no cabeçalho)
------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas_nacional() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas_nacional() TO authenticated;

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas_montado() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas_montado() TO authenticated;

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas() TO authenticated;

-- Helper interno: sem trava de uid próprio, então nem `authenticated` executa.
-- Quem chama é sempre outra função SECURITY DEFINER (dona = postgres).
REVOKE ALL ON FUNCTION public.tentativas_gratuitas_usadas(uuid) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.tentativas_gratuitas_restantes_nacional(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tentativas_gratuitas_restantes_nacional(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.tentativas_gratuitas_restantes_montado(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tentativas_gratuitas_restantes_montado(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.tentativas_gratuitas_restantes(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tentativas_gratuitas_restantes(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_status_acesso() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_status_acesso() TO authenticated;

REVOKE ALL ON FUNCTION public.listar_temas_com_contagem(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.listar_temas_com_contagem(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.iniciar_tentativa(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gerar_simulado_personalizado(uuid[], integer, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.limite_tentativas_gratuitas() IS
  'Teto vitalicio total do plano gratuito. Derivado: nacional (2) + montado (1).';

COMMENT ON FUNCTION public.limite_tentativas_gratuitas_nacional() IS
  'Quantas das tentativas gratuitas podem ser gastas em treino PRONTO (iniciar_tentativa).';

COMMENT ON FUNCTION public.limite_tentativas_gratuitas_montado() IS
  'Quantas das tentativas gratuitas podem ser gastas montando simulado (gerar_simulado_personalizado).';

COMMENT ON FUNCTION public.tentativas_gratuitas_usadas(uuid) IS
  'Helper INTERNO (sem grant para authenticated): tentativas ja consumidas, separadas por balde. Montado = prova.origem = personalizado.';

COMMENT ON FUNCTION public.tentativas_gratuitas_restantes_nacional(uuid) IS
  'Saldo do balde de treinos prontos. NULL = ilimitado (nao se aplica a quem paga). Limitado tambem pelo cap global de limite_tentativas_gratuitas().';

COMMENT ON FUNCTION public.tentativas_gratuitas_restantes_montado(uuid) IS
  'Saldo do balde de simulado montado. NULL = ilimitado (nao se aplica a quem paga). Limitado tambem pelo cap global de limite_tentativas_gratuitas().';

COMMENT ON FUNCTION public.tentativas_gratuitas_restantes(uuid) IS
  'Saldo TOTAL de tentativas gratuitas = nacional + montado. NULL = ilimitado. Conta todo o historico de tentativa, exceto modo visualizar.';

COMMENT ON FUNCTION public.listar_temas_com_contagem(text, text) IS
  'Temas com contagem de questoes. SECURITY DEFINER porque o RLS de questao exige assinatura ativa e o plano gratuito precisa montar simulado; devolve so agregado, nunca conteudo de questao.';
