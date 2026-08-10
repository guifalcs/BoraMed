-- =============================================================================
-- Free tier — plano gratuito com teto de tentativas
-- =============================================================================
-- Antes: paywall total. Todo o /dashboard exigia assinatura authorized e quem
-- cadastrava caía direto em /planos sem ver nada do produto.
--
-- Agora "sem assinatura" deixa de ser "sem acesso" e vira um nível próprio:
--
--   nivel_acesso() -> 'gratuito' | 'essencial' | 'avancado'   (função TOTAL)
--
-- O gratuito faz até limite_tentativas_gratuitas() tentativas VITALÍCIAS, e só
-- em provas de formato 'nacional'. O contador olha todo o histórico de
-- `tentativa` (decisão de produto), então não há coluna nova nem backfill: quem
-- usou a plataforma como assinante e depois churnou já chega em 0.
--
-- assinatura_tier() passa a ser derivada de nivel_acesso() e mantém o contrato
-- antigo (NULL para quem não paga), preservando tierAvancadoGuard e os gates
-- P0015 de 20260717142000. tem_assinatura_ativa() NÃO muda de semântica:
-- continua significando "tem acesso pago" e segue protegendo o RLS de
-- questao/alternativa e, via tem_acesso_avancado(), materiais e flashcards.
--
-- Correções que entram de carona:
--   * nivel_acesso considera a carência de `cancelled`, que assinatura_tier
--     ignorava. Antes o usuário que cancelava dentro do período pago passava no
--     paywall mas era barrado pelo gate de tier.
--   * nivel_acesso herda de tem_assinatura_ativa a trava de só consultar o
--     próprio uid; assinatura_tier permitia sondar terceiros.
--   * o broadcast de admin_enviar_notificacao varria auth.users sem filtro
--     nenhum (incluía admins, banidos e contas não confirmadas).
--
-- Códigos de erro: P0015 tier_upgrade_required (já existia), P0016
-- free_limit_reached (novo).
--
-- ⚠️ Os REVOKE/GRANT e COMMENT no fim do arquivo foram reescritos à mão: o
-- `db pull` (migra) não os emite, e sem eles as funções novas nascem com
-- EXECUTE para PUBLIC/anon. Mesma regressão documentada em 20260624131517.
-- =============================================================================

drop function if exists "public"."admin_enviar_notificacao"(p_tipo text, p_titulo text, p_mensagem text, p_user_id uuid);

alter table "public"."avisos" add column "segmento" text not null default 'todos'::text;

alter table "public"."avisos" add constraint "avisos_segmento_check" CHECK ((segmento = ANY (ARRAY['todos'::text, 'pagantes'::text, 'gratuitos'::text, 'essencial'::text, 'avancado'::text]))) not valid;

alter table "public"."avisos" validate constraint "avisos_segmento_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_enviar_notificacao(p_tipo text, p_titulo text, p_mensagem text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_segmento text DEFAULT 'todos'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  IF p_tipo NOT IN ('sistema', 'conquista', 'info', 'aviso') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = 'P0001';
  END IF;

  IF p_segmento NOT IN ('todos', 'pagantes', 'gratuitos', 'essencial', 'avancado') THEN
    RAISE EXCEPTION 'segmento_invalido' USING ERRCODE = 'P0001';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    VALUES (p_user_id, p_tipo, p_titulo, p_mensagem);
    RETURN 1;
  END IF;

  -- Broadcast: só alunos ativos, filtrados pelo segmento. Antes varria
  -- auth.users cru, incluindo admins, banidos e contas nao confirmadas.
  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
  SELECT pr.id, p_tipo, p_titulo, p_mensagem
  FROM public.profiles pr
  JOIN auth.users u ON u.id = pr.id
  WHERE pr.papel = 'aluno'
    AND pr.banido = false
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND public.nivel_no_segmento(public.nivel_acesso(pr.id), p_segmento);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

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
    END
  );
$function$
;

CREATE OR REPLACE FUNCTION public.limite_tentativas_gratuitas()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 3;
$function$
;

CREATE OR REPLACE FUNCTION public.nivel_acesso(uid uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    -- Só permite consultar o próprio nível; admin pode consultar qualquer uid.
    WHEN uid IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN 'gratuito'
    WHEN public.is_admin(uid) THEN 'avancado'
    ELSE coalesce((
      SELECT CASE WHEN a.plano_id IS NULL THEN 'avancado' ELSE p.tier END
      FROM public.assinatura a
      LEFT JOIN public.plano p ON p.id = a.plano_id
      WHERE a.user_id = uid
        AND (
          (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
          OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
        )
      ORDER BY (a.status = 'authorized') DESC, a.criado_em DESC
      LIMIT 1
    ), 'gratuito')
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.nivel_no_segmento(p_nivel text, p_segmento text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_segmento
    WHEN 'todos'     THEN true
    WHEN 'pagantes'  THEN p_nivel IN ('essencial', 'avancado')
    WHEN 'gratuitos' THEN p_nivel = 'gratuito'
    WHEN 'essencial' THEN p_nivel = 'essencial'
    WHEN 'avancado'  THEN p_nivel = 'avancado'
    ELSE false
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.tentativas_gratuitas_restantes(uid uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN uid IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN 0
    WHEN public.nivel_acesso(uid) <> 'gratuito' THEN NULL
    ELSE greatest(0, public.limite_tentativas_gratuitas() - (
      SELECT count(*)::integer
      FROM public.tentativa
      WHERE user_id = uid
        AND modo <> 'visualizar'
    ))
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.assinatura_tier(uid uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT nullif(public.nivel_acesso(uid), 'gratuito');
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_avisos_pendentes()
 RETURNS SETOF public.avisos
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.*
  FROM public.avisos a
  WHERE a.ativo = true
    AND public.nivel_no_segmento((SELECT public.nivel_acesso()), a.segmento)
    AND NOT EXISTS (
      SELECT 1 FROM public.avisos_vistos v
      WHERE v.aviso_id = a.id
        AND v.user_id = (SELECT auth.uid())
    )
  ORDER BY a.criado_em ASC;
$function$
;

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

  -- Teto vitalício do plano gratuito. Debita ao iniciar, sem estorno; retomar
  -- uma tentativa pausada usa outra RPC e por isso nunca debita de novo.
  IF v_nivel = 'gratuito'
     AND p_modo <> 'visualizar'
     AND public.tentativas_gratuitas_restantes() <= 0 THEN
    RAISE EXCEPTION 'free_limit_reached: limite de tentativas do plano gratuito atingido' USING ERRCODE = 'P0016';
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

------------------------------------------------------------------------------
-- Grants e comentários (não emitidos pelo `db pull` — ver aviso no cabeçalho)
------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.nivel_acesso(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.nivel_acesso(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.limite_tentativas_gratuitas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.limite_tentativas_gratuitas() TO authenticated;

REVOKE ALL ON FUNCTION public.tentativas_gratuitas_restantes(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tentativas_gratuitas_restantes(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_status_acesso() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_status_acesso() TO authenticated;

REVOKE ALL ON FUNCTION public.nivel_no_segmento(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.nivel_no_segmento(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_enviar_notificacao(text, text, text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_enviar_notificacao(text, text, text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.iniciar_tentativa(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_tentativa(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.nivel_acesso(uuid) IS
  'Nivel de acesso do usuario: gratuito | essencial | avancado. Funcao total (nunca NULL). Fonte unica para assinatura_tier e para os gates de conteudo.';

COMMENT ON FUNCTION public.tentativas_gratuitas_restantes(uuid) IS
  'Tentativas restantes do plano gratuito. NULL = ilimitado (nao se aplica a quem paga). Conta todo o historico de tentativa, exceto modo visualizar.';

COMMENT ON COLUMN public.avisos.segmento IS
  'Publico do aviso por nivel de acesso: todos | pagantes | gratuitos | essencial | avancado.';


