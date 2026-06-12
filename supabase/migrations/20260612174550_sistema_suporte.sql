drop policy "impersonation_log_select_super_admin" on "public"."admin_impersonation_log";

drop function if exists "public"."admin_get_questao"(p_id uuid);

drop function if exists "public"."get_revisao_prova"(p_prova_id uuid);


  create table "public"."suporte_faq" (
    "id" uuid not null default gen_random_uuid(),
    "pergunta" text not null,
    "resposta" text not null,
    "categoria" text,
    "ordem" integer not null default 0,
    "ativo" boolean not null default true,
    "criado_em" timestamp with time zone not null default now(),
    "atualizado_em" timestamp with time zone not null default now()
      );


alter table "public"."suporte_faq" enable row level security;


  create table "public"."suporte_mensagens" (
    "id" uuid not null default gen_random_uuid(),
    "ticket_id" uuid not null,
    "autor_id" uuid not null,
    "mensagem" text not null,
    "is_admin" boolean not null default false,
    "criado_em" timestamp with time zone not null default now()
      );


alter table "public"."suporte_mensagens" enable row level security;


  create table "public"."suporte_tickets" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "titulo" text not null,
    "descricao" text not null,
    "categoria" text not null,
    "status" text not null default 'aberto'::text,
    "criado_em" timestamp with time zone not null default now(),
    "atualizado_em" timestamp with time zone not null default now()
      );


alter table "public"."suporte_tickets" enable row level security;

alter table "public"."profiles" add column if not exists "avatar_url" text;

alter table "public"."profiles" add column if not exists "nome_completo" text;

CREATE INDEX suporte_faq_ativo_ordem_idx ON public.suporte_faq USING btree (ativo, ordem) WHERE (ativo = true);

CREATE UNIQUE INDEX suporte_faq_pkey ON public.suporte_faq USING btree (id);

CREATE UNIQUE INDEX suporte_mensagens_pkey ON public.suporte_mensagens USING btree (id);

CREATE INDEX suporte_mensagens_ticket_idx ON public.suporte_mensagens USING btree (ticket_id, criado_em);

CREATE UNIQUE INDEX suporte_tickets_pkey ON public.suporte_tickets USING btree (id);

CREATE INDEX suporte_tickets_status_idx ON public.suporte_tickets USING btree (status, criado_em DESC);

CREATE INDEX suporte_tickets_user_idx ON public.suporte_tickets USING btree (user_id, criado_em DESC);

alter table "public"."suporte_faq" add constraint "suporte_faq_pkey" PRIMARY KEY using index "suporte_faq_pkey";

alter table "public"."suporte_mensagens" add constraint "suporte_mensagens_pkey" PRIMARY KEY using index "suporte_mensagens_pkey";

alter table "public"."suporte_tickets" add constraint "suporte_tickets_pkey" PRIMARY KEY using index "suporte_tickets_pkey";

alter table "public"."suporte_mensagens" add constraint "suporte_mensagens_autor_id_fkey" FOREIGN KEY (autor_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."suporte_mensagens" validate constraint "suporte_mensagens_autor_id_fkey";

alter table "public"."suporte_mensagens" add constraint "suporte_mensagens_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES public.suporte_tickets(id) ON DELETE CASCADE not valid;

alter table "public"."suporte_mensagens" validate constraint "suporte_mensagens_ticket_id_fkey";

alter table "public"."suporte_tickets" add constraint "suporte_tickets_categoria_check" CHECK ((categoria = ANY (ARRAY['problema_tecnico'::text, 'duvida_conteudo'::text, 'assinatura_pagamento'::text, 'outro'::text]))) not valid;

alter table "public"."suporte_tickets" validate constraint "suporte_tickets_categoria_check";

alter table "public"."suporte_tickets" add constraint "suporte_tickets_status_check" CHECK ((status = ANY (ARRAY['aberto'::text, 'em_andamento'::text, 'resolvido'::text]))) not valid;

alter table "public"."suporte_tickets" validate constraint "suporte_tickets_status_check";

alter table "public"."suporte_tickets" add constraint "suporte_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."suporte_tickets" validate constraint "suporte_tickets_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_atualizar_status_ticket(p_ticket_id uuid, p_status text)
 RETURNS public.suporte_tickets
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_ticket public.suporte_tickets;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  UPDATE public.suporte_tickets
  SET status = p_status
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  -- Notifica o usuário se resolvido
  IF p_status = 'resolvido' THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    VALUES (
      v_ticket.user_id,
      'info',
      'Chamado resolvido',
      'Seu chamado "' || v_ticket.titulo || '" foi marcado como resolvido.'
    );
  END IF;

  RETURN v_ticket;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_criar_faq(p_pergunta text, p_resposta text, p_categoria text DEFAULT NULL::text)
 RETURNS public.suporte_faq
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_faq public.suporte_faq;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
  INSERT INTO public.suporte_faq (pergunta, resposta, categoria, ordem)
  VALUES (p_pergunta, p_resposta, p_categoria,
          (SELECT COALESCE(MAX(ordem), 0) + 1 FROM public.suporte_faq))
  RETURNING * INTO v_faq;
  RETURN v_faq;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_deletar_faq(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
  DELETE FROM public.suporte_faq WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_detalhar_ticket(p_ticket_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v_result JSON;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  SELECT json_build_object(
    'ticket', row_to_json(t),
    'mensagens', (
      SELECT json_agg(m ORDER BY m.criado_em)
      FROM public.suporte_mensagens m
      WHERE m.ticket_id = p_ticket_id
    ),
    'perfil', json_build_object(
      'nome_completo', p.nome_completo,
      'email',         p.email,
      'avatar_url',    p.avatar_url
    )
  )
  INTO v_result
  FROM public.suporte_tickets t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.id = p_ticket_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_listar_faq()
 RETURNS SETOF public.suporte_faq
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM public.suporte_faq ORDER BY ordem, criado_em;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_listar_tickets(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, user_id uuid, titulo text, descricao text, categoria text, status text, criado_em timestamp with time zone, atualizado_em timestamp with time zone, total_mensagens bigint, perfil_nome text, perfil_email text, perfil_avatar text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    t.id, t.user_id, t.titulo, t.descricao, t.categoria, t.status,
    t.criado_em, t.atualizado_em,
    COUNT(m.id) AS total_mensagens,
    p.nome_completo AS perfil_nome,
    p.email         AS perfil_email,
    p.avatar_url    AS perfil_avatar
  FROM public.suporte_tickets t
  LEFT JOIN public.suporte_mensagens m ON m.ticket_id = t.id
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE public.is_admin()
    AND (p_status IS NULL OR t.status = p_status)
  GROUP BY t.id, p.nome_completo, p.email, p.avatar_url
  ORDER BY t.criado_em DESC
  LIMIT p_limit OFFSET p_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_responder_ticket(p_ticket_id uuid, p_mensagem text)
 RETURNS public.suporte_mensagens
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_msg    public.suporte_mensagens;
  v_ticket public.suporte_tickets;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores';
  END IF;

  SELECT * INTO v_ticket FROM public.suporte_tickets WHERE id = p_ticket_id;

  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (p_ticket_id, (SELECT auth.uid()), p_mensagem, true)
  RETURNING * INTO v_msg;

  UPDATE public.suporte_tickets
  SET status = 'em_andamento'
  WHERE id = p_ticket_id AND status = 'aberto';

  -- Notifica o usuário
  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
  VALUES (
    v_ticket.user_id,
    'info',
    'Resposta no seu chamado',
    'Você recebeu uma resposta no chamado "' || v_ticket.titulo || '".'
  );

  RETURN v_msg;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_toggle_faq(p_id uuid)
 RETURNS public.suporte_faq
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_faq public.suporte_faq;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
  UPDATE public.suporte_faq SET ativo = NOT ativo WHERE id = p_id RETURNING * INTO v_faq;
  RETURN v_faq;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_faq()
 RETURNS SETOF public.suporte_faq
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM public.suporte_faq WHERE ativo = true ORDER BY ordem, criado_em;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_mensagens_ticket(p_ticket_id uuid)
 RETURNS SETOF public.suporte_mensagens
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT m.*
  FROM public.suporte_mensagens m
  JOIN public.suporte_tickets t ON t.id = m.ticket_id
  WHERE m.ticket_id = p_ticket_id
    AND (t.user_id = (SELECT auth.uid()) OR public.is_admin())
  ORDER BY m.criado_em;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_meus_tickets()
 RETURNS TABLE(id uuid, titulo text, descricao text, categoria text, status text, criado_em timestamp with time zone, atualizado_em timestamp with time zone, total_mensagens bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    t.id, t.titulo, t.descricao, t.categoria, t.status,
    t.criado_em, t.atualizado_em,
    COUNT(m.id) AS total_mensagens
  FROM public.suporte_tickets t
  LEFT JOIN public.suporte_mensagens m ON m.ticket_id = t.id
  WHERE t.user_id = (SELECT auth.uid())
  GROUP BY t.id
  ORDER BY t.criado_em DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.criar_ticket(p_titulo text, p_descricao text, p_categoria text)
 RETURNS public.suporte_tickets
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_ticket public.suporte_tickets;
BEGIN
  INSERT INTO public.suporte_tickets (user_id, titulo, descricao, categoria)
  VALUES ((SELECT auth.uid()), p_titulo, p_descricao, p_categoria)
  RETURNING * INTO v_ticket;

  -- Mensagem inicial = descrição
  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (v_ticket.id, (SELECT auth.uid()), p_descricao, false);

  -- Notificação de confirmação para o usuário
  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
  VALUES (
    (SELECT auth.uid()),
    'info',
    'Solicitação recebida',
    'Recebemos sua solicitação "' || p_titulo || '". Em breve entraremos em contato.'
  );

  RETURN v_ticket;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enviar_mensagem_ticket(p_ticket_id uuid, p_mensagem text)
 RETURNS public.suporte_mensagens
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_msg public.suporte_mensagens;
BEGIN
  -- Valida acesso
  IF NOT EXISTS (
    SELECT 1 FROM public.suporte_tickets t
    WHERE t.id = p_ticket_id
      AND (t.user_id = (SELECT auth.uid()) OR public.is_admin())
      AND t.status <> 'resolvido'
  ) THEN
    RAISE EXCEPTION 'Acesso negado ou ticket encerrado';
  END IF;

  INSERT INTO public.suporte_mensagens (ticket_id, autor_id, mensagem, is_admin)
  VALUES (p_ticket_id, (SELECT auth.uid()), p_mensagem, public.is_admin())
  RETURNING * INTO v_msg;

  -- Atualiza status para em_andamento se era aberto
  UPDATE public.suporte_tickets
  SET status = 'em_andamento'
  WHERE id = p_ticket_id AND status = 'aberto' AND public.is_admin();

  RETURN v_msg;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_simulado_personalizado(p_tema_ids uuid[] DEFAULT NULL::uuid[], p_qtd integer DEFAULT 10, p_modo text DEFAULT 'simulado'::text, p_tipo_questao text DEFAULT NULL::text, p_formato text DEFAULT NULL::text)
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
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = 'P0001';
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

  SELECT array(
    WITH questoes_entregues AS (
      SELECT DISTINCT tr.questao_id
      FROM public.tentativa t
      JOIN public.tentativa_resposta tr ON tr.tentativa_id = t.id
      WHERE t.user_id = v_user_id
        AND t.modo <> 'visualizar'
    )
    SELECT q.id
    FROM public.questao q
    LEFT JOIN questoes_entregues qe ON qe.questao_id = q.id
    WHERE q.status = 'ativa'
      AND (p_tipo_questao IS NULL OR q.tipo_questao = p_tipo_questao)
      AND (p_tipo_questao IS DISTINCT FROM 'laboratorio' OR q.imagem_url IS NOT NULL)
      AND (
        p_formato IS NULL
        OR p_formato = 'laboratorio'
        OR q.formato_prova IS NULL
        OR q.formato_prova = p_formato
        OR (q.formato_prova IN ('N1', 'N2', 'teste_progresso') AND p_formato = 'nacional')
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
    ORDER BY (qe.questao_id IS NOT NULL) ASC, random()
    LIMIT p_qtd
  )
  INTO v_selected_ids;

  v_total := coalesce(array_length(v_selected_ids, 1), 0);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma questao encontrada para os temas selecionados. Tente selecionar outros temas ou reduzir a quantidade.' USING ERRCODE = 'P0004';
  END IF;

  IF p_tema_ids IS NULL OR array_length(p_tema_ids, 1) IS NULL THEN
    v_nome := CASE
      WHEN p_formato IS NULL THEN 'Simulado personalizado - '
      WHEN p_tipo_questao = 'laboratorio' THEN 'Simulado laboratorio - '
      ELSE 'Simulado personalizado - '
    END || v_total || ' questoes';
  ELSE
    SELECT CASE
      WHEN p_formato IS NULL THEN 'Simulado - '
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

CREATE OR REPLACE FUNCTION public.get_ranking_global(p_limite integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limite  integer;
  v_user_id uuid;
begin
  v_limite  := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_user_id := auth.uid();

  return (
    with ranking as (
      select
        s.user_id,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
          else 'Anônimo'
        end as nome_display,
        case
          when coalesce(p.competir_publico, s.competir_publico, true)
            then p.avatar_url
          else null
        end as avatar_url,
        s.nivel,
        s.xp_total,
        s.xp_semana_atual,
        row_number() over (order by s.xp_total desc, s.atualizado_em asc, s.user_id asc) as posicao,
        (s.user_id = v_user_id) as is_me
      from public.user_gamificacao_stats s
      left join public.profiles p on p.id = s.user_id
      where s.xp_total > 0
    ),
    top_n as (
      select * from ranking where posicao <= v_limite
    ),
    eu_fora as (
      select * from ranking
      where v_user_id is not null
        and user_id = v_user_id
        and posicao > v_limite
    ),
    combinado as (
      select * from top_n
      union all
      select * from eu_fora
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id',        user_id,
          'nome_display',   nome_display,
          'avatar_url',     avatar_url,
          'nivel',          nivel,
          'xp_total',       xp_total,
          'xp_semana_atual', xp_semana_atual,
          'posicao',        posicao,
          'is_me',          is_me
        )
        order by posicao
      ),
      '[]'::jsonb
    )
    from combinado
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ranking_semana(p_limite integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limite     integer;
  v_semana_iso text;
begin
  v_limite     := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_semana_iso := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW');

  return (
    with ranking as (
      select s.user_id,
        case when coalesce(p.competir_publico, s.competir_publico, true)
          then coalesce(nullif(p.nome_completo, ''), split_part(p.email, '@', 1), 'Aluno')
          else 'Anônimo' end as nome_display,
        s.nivel, s.xp_total, s.xp_semana_atual,
        row_number() over (order by s.xp_semana_atual desc, s.atualizado_em asc, s.user_id asc) as posicao
      from public.user_gamificacao_stats s
      left join public.profiles p on p.id = s.user_id
      where s.xp_semana_atual > 0
        and s.semana_iso = v_semana_iso
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'nome_display', nome_display, 'nivel', nivel,
      'xp_total', xp_total, 'xp_semana_atual', xp_semana_atual, 'posicao', posicao
    ) order by posicao), '[]'::jsonb)
    from ranking where posicao <= v_limite
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_temas_com_contagem(p_tipo_questao text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, disciplina_id uuid, disciplina text, periodo integer, parent_id uuid, criado_em timestamp with time zone, qtd_questoes bigint)
 LANGUAGE sql
 STABLE
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
  GROUP BY t.id, t.nome, t.disciplina_id, dq.sigla, dq.periodo, t.parent_id, t.criado_em
  ORDER BY t.nome;
$function$
;

grant delete on table "public"."admin_impersonation_log" to "service_role";

grant insert on table "public"."admin_impersonation_log" to "service_role";

grant select on table "public"."admin_impersonation_log" to "service_role";

grant update on table "public"."admin_impersonation_log" to "service_role";

grant references on table "public"."alternativa" to "authenticated";

grant select on table "public"."alternativa" to "authenticated";

grant trigger on table "public"."alternativa" to "authenticated";

grant delete on table "public"."alternativa" to "service_role";

grant insert on table "public"."alternativa" to "service_role";

grant select on table "public"."alternativa" to "service_role";

grant update on table "public"."alternativa" to "service_role";

grant delete on table "public"."avisos" to "anon";

grant insert on table "public"."avisos" to "anon";

grant references on table "public"."avisos" to "anon";

grant select on table "public"."avisos" to "anon";

grant trigger on table "public"."avisos" to "anon";

grant truncate on table "public"."avisos" to "anon";

grant update on table "public"."avisos" to "anon";

grant delete on table "public"."avisos" to "authenticated";

grant insert on table "public"."avisos" to "authenticated";

grant references on table "public"."avisos" to "authenticated";

grant select on table "public"."avisos" to "authenticated";

grant trigger on table "public"."avisos" to "authenticated";

grant truncate on table "public"."avisos" to "authenticated";

grant update on table "public"."avisos" to "authenticated";

grant delete on table "public"."avisos" to "service_role";

grant insert on table "public"."avisos" to "service_role";

grant select on table "public"."avisos" to "service_role";

grant update on table "public"."avisos" to "service_role";

grant delete on table "public"."avisos_vistos" to "anon";

grant insert on table "public"."avisos_vistos" to "anon";

grant references on table "public"."avisos_vistos" to "anon";

grant select on table "public"."avisos_vistos" to "anon";

grant trigger on table "public"."avisos_vistos" to "anon";

grant truncate on table "public"."avisos_vistos" to "anon";

grant update on table "public"."avisos_vistos" to "anon";

grant delete on table "public"."avisos_vistos" to "authenticated";

grant insert on table "public"."avisos_vistos" to "authenticated";

grant references on table "public"."avisos_vistos" to "authenticated";

grant select on table "public"."avisos_vistos" to "authenticated";

grant trigger on table "public"."avisos_vistos" to "authenticated";

grant truncate on table "public"."avisos_vistos" to "authenticated";

grant update on table "public"."avisos_vistos" to "authenticated";

grant delete on table "public"."avisos_vistos" to "service_role";

grant insert on table "public"."avisos_vistos" to "service_role";

grant select on table "public"."avisos_vistos" to "service_role";

grant update on table "public"."avisos_vistos" to "service_role";

grant delete on table "public"."conquista_catalogo" to "authenticated";

grant insert on table "public"."conquista_catalogo" to "authenticated";

grant references on table "public"."conquista_catalogo" to "authenticated";

grant trigger on table "public"."conquista_catalogo" to "authenticated";

grant truncate on table "public"."conquista_catalogo" to "authenticated";

grant update on table "public"."conquista_catalogo" to "authenticated";

grant delete on table "public"."conquista_catalogo" to "service_role";

grant insert on table "public"."conquista_catalogo" to "service_role";

grant select on table "public"."conquista_catalogo" to "service_role";

grant update on table "public"."conquista_catalogo" to "service_role";

grant delete on table "public"."desafio_diario" to "authenticated";

grant insert on table "public"."desafio_diario" to "authenticated";

grant references on table "public"."desafio_diario" to "authenticated";

grant trigger on table "public"."desafio_diario" to "authenticated";

grant truncate on table "public"."desafio_diario" to "authenticated";

grant update on table "public"."desafio_diario" to "authenticated";

grant delete on table "public"."desafio_diario" to "service_role";

grant insert on table "public"."desafio_diario" to "service_role";

grant select on table "public"."desafio_diario" to "service_role";

grant update on table "public"."desafio_diario" to "service_role";

grant delete on table "public"."desafio_diario_resposta" to "authenticated";

grant insert on table "public"."desafio_diario_resposta" to "authenticated";

grant references on table "public"."desafio_diario_resposta" to "authenticated";

grant trigger on table "public"."desafio_diario_resposta" to "authenticated";

grant truncate on table "public"."desafio_diario_resposta" to "authenticated";

grant update on table "public"."desafio_diario_resposta" to "authenticated";

grant delete on table "public"."desafio_diario_resposta" to "service_role";

grant insert on table "public"."desafio_diario_resposta" to "service_role";

grant select on table "public"."desafio_diario_resposta" to "service_role";

grant update on table "public"."desafio_diario_resposta" to "service_role";

grant delete on table "public"."disciplina" to "anon";

grant insert on table "public"."disciplina" to "anon";

grant references on table "public"."disciplina" to "anon";

grant select on table "public"."disciplina" to "anon";

grant trigger on table "public"."disciplina" to "anon";

grant truncate on table "public"."disciplina" to "anon";

grant update on table "public"."disciplina" to "anon";

grant delete on table "public"."disciplina" to "authenticated";

grant insert on table "public"."disciplina" to "authenticated";

grant references on table "public"."disciplina" to "authenticated";

grant select on table "public"."disciplina" to "authenticated";

grant trigger on table "public"."disciplina" to "authenticated";

grant truncate on table "public"."disciplina" to "authenticated";

grant update on table "public"."disciplina" to "authenticated";

grant delete on table "public"."disciplina" to "service_role";

grant insert on table "public"."disciplina" to "service_role";

grant select on table "public"."disciplina" to "service_role";

grant update on table "public"."disciplina" to "service_role";

grant references on table "public"."faculdade" to "authenticated";

grant select on table "public"."faculdade" to "authenticated";

grant trigger on table "public"."faculdade" to "authenticated";

grant delete on table "public"."faculdade" to "service_role";

grant insert on table "public"."faculdade" to "service_role";

grant select on table "public"."faculdade" to "service_role";

grant update on table "public"."faculdade" to "service_role";

grant delete on table "public"."gamificacao_evento" to "authenticated";

grant insert on table "public"."gamificacao_evento" to "authenticated";

grant references on table "public"."gamificacao_evento" to "authenticated";

grant trigger on table "public"."gamificacao_evento" to "authenticated";

grant truncate on table "public"."gamificacao_evento" to "authenticated";

grant update on table "public"."gamificacao_evento" to "authenticated";

grant delete on table "public"."gamificacao_evento" to "service_role";

grant insert on table "public"."gamificacao_evento" to "service_role";

grant select on table "public"."gamificacao_evento" to "service_role";

grant update on table "public"."gamificacao_evento" to "service_role";

grant delete on table "public"."notificacoes" to "anon";

grant insert on table "public"."notificacoes" to "anon";

grant references on table "public"."notificacoes" to "anon";

grant select on table "public"."notificacoes" to "anon";

grant trigger on table "public"."notificacoes" to "anon";

grant truncate on table "public"."notificacoes" to "anon";

grant update on table "public"."notificacoes" to "anon";

grant delete on table "public"."notificacoes" to "authenticated";

grant insert on table "public"."notificacoes" to "authenticated";

grant references on table "public"."notificacoes" to "authenticated";

grant select on table "public"."notificacoes" to "authenticated";

grant trigger on table "public"."notificacoes" to "authenticated";

grant truncate on table "public"."notificacoes" to "authenticated";

grant update on table "public"."notificacoes" to "authenticated";

grant delete on table "public"."notificacoes" to "service_role";

grant insert on table "public"."notificacoes" to "service_role";

grant select on table "public"."notificacoes" to "service_role";

grant update on table "public"."notificacoes" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant references on table "public"."prova" to "authenticated";

grant select on table "public"."prova" to "authenticated";

grant trigger on table "public"."prova" to "authenticated";

grant delete on table "public"."prova" to "service_role";

grant insert on table "public"."prova" to "service_role";

grant select on table "public"."prova" to "service_role";

grant update on table "public"."prova" to "service_role";

grant delete on table "public"."prova_questao" to "anon";

grant insert on table "public"."prova_questao" to "anon";

grant references on table "public"."prova_questao" to "anon";

grant select on table "public"."prova_questao" to "anon";

grant trigger on table "public"."prova_questao" to "anon";

grant truncate on table "public"."prova_questao" to "anon";

grant update on table "public"."prova_questao" to "anon";

grant references on table "public"."prova_questao" to "authenticated";

grant select on table "public"."prova_questao" to "authenticated";

grant trigger on table "public"."prova_questao" to "authenticated";

grant truncate on table "public"."prova_questao" to "authenticated";

grant delete on table "public"."prova_questao" to "service_role";

grant insert on table "public"."prova_questao" to "service_role";

grant select on table "public"."prova_questao" to "service_role";

grant update on table "public"."prova_questao" to "service_role";

grant references on table "public"."questao" to "authenticated";

grant select on table "public"."questao" to "authenticated";

grant trigger on table "public"."questao" to "authenticated";

grant delete on table "public"."questao" to "service_role";

grant insert on table "public"."questao" to "service_role";

grant select on table "public"."questao" to "service_role";

grant update on table "public"."questao" to "service_role";

grant references on table "public"."questao_tema" to "authenticated";

grant select on table "public"."questao_tema" to "authenticated";

grant trigger on table "public"."questao_tema" to "authenticated";

grant delete on table "public"."questao_tema" to "service_role";

grant insert on table "public"."questao_tema" to "service_role";

grant select on table "public"."questao_tema" to "service_role";

grant update on table "public"."questao_tema" to "service_role";

grant delete on table "public"."suporte_faq" to "anon";

grant insert on table "public"."suporte_faq" to "anon";

grant references on table "public"."suporte_faq" to "anon";

grant select on table "public"."suporte_faq" to "anon";

grant trigger on table "public"."suporte_faq" to "anon";

grant truncate on table "public"."suporte_faq" to "anon";

grant update on table "public"."suporte_faq" to "anon";

grant delete on table "public"."suporte_faq" to "authenticated";

grant insert on table "public"."suporte_faq" to "authenticated";

grant references on table "public"."suporte_faq" to "authenticated";

grant select on table "public"."suporte_faq" to "authenticated";

grant trigger on table "public"."suporte_faq" to "authenticated";

grant truncate on table "public"."suporte_faq" to "authenticated";

grant update on table "public"."suporte_faq" to "authenticated";

grant delete on table "public"."suporte_faq" to "service_role";

grant insert on table "public"."suporte_faq" to "service_role";

grant references on table "public"."suporte_faq" to "service_role";

grant select on table "public"."suporte_faq" to "service_role";

grant trigger on table "public"."suporte_faq" to "service_role";

grant truncate on table "public"."suporte_faq" to "service_role";

grant update on table "public"."suporte_faq" to "service_role";

grant delete on table "public"."suporte_mensagens" to "anon";

grant insert on table "public"."suporte_mensagens" to "anon";

grant references on table "public"."suporte_mensagens" to "anon";

grant select on table "public"."suporte_mensagens" to "anon";

grant trigger on table "public"."suporte_mensagens" to "anon";

grant truncate on table "public"."suporte_mensagens" to "anon";

grant update on table "public"."suporte_mensagens" to "anon";

grant delete on table "public"."suporte_mensagens" to "authenticated";

grant insert on table "public"."suporte_mensagens" to "authenticated";

grant references on table "public"."suporte_mensagens" to "authenticated";

grant select on table "public"."suporte_mensagens" to "authenticated";

grant trigger on table "public"."suporte_mensagens" to "authenticated";

grant truncate on table "public"."suporte_mensagens" to "authenticated";

grant update on table "public"."suporte_mensagens" to "authenticated";

grant delete on table "public"."suporte_mensagens" to "service_role";

grant insert on table "public"."suporte_mensagens" to "service_role";

grant references on table "public"."suporte_mensagens" to "service_role";

grant select on table "public"."suporte_mensagens" to "service_role";

grant trigger on table "public"."suporte_mensagens" to "service_role";

grant truncate on table "public"."suporte_mensagens" to "service_role";

grant update on table "public"."suporte_mensagens" to "service_role";

grant delete on table "public"."suporte_tickets" to "anon";

grant insert on table "public"."suporte_tickets" to "anon";

grant references on table "public"."suporte_tickets" to "anon";

grant select on table "public"."suporte_tickets" to "anon";

grant trigger on table "public"."suporte_tickets" to "anon";

grant truncate on table "public"."suporte_tickets" to "anon";

grant update on table "public"."suporte_tickets" to "anon";

grant delete on table "public"."suporte_tickets" to "authenticated";

grant insert on table "public"."suporte_tickets" to "authenticated";

grant references on table "public"."suporte_tickets" to "authenticated";

grant select on table "public"."suporte_tickets" to "authenticated";

grant trigger on table "public"."suporte_tickets" to "authenticated";

grant truncate on table "public"."suporte_tickets" to "authenticated";

grant update on table "public"."suporte_tickets" to "authenticated";

grant delete on table "public"."suporte_tickets" to "service_role";

grant insert on table "public"."suporte_tickets" to "service_role";

grant references on table "public"."suporte_tickets" to "service_role";

grant select on table "public"."suporte_tickets" to "service_role";

grant trigger on table "public"."suporte_tickets" to "service_role";

grant truncate on table "public"."suporte_tickets" to "service_role";

grant update on table "public"."suporte_tickets" to "service_role";

grant references on table "public"."tema" to "authenticated";

grant select on table "public"."tema" to "authenticated";

grant trigger on table "public"."tema" to "authenticated";

grant delete on table "public"."tema" to "service_role";

grant insert on table "public"."tema" to "service_role";

grant select on table "public"."tema" to "service_role";

grant update on table "public"."tema" to "service_role";

grant delete on table "public"."tentativa" to "authenticated";

grant insert on table "public"."tentativa" to "authenticated";

grant references on table "public"."tentativa" to "authenticated";

grant select on table "public"."tentativa" to "authenticated";

grant trigger on table "public"."tentativa" to "authenticated";

grant truncate on table "public"."tentativa" to "authenticated";

grant update on table "public"."tentativa" to "authenticated";

grant delete on table "public"."tentativa" to "service_role";

grant insert on table "public"."tentativa" to "service_role";

grant select on table "public"."tentativa" to "service_role";

grant update on table "public"."tentativa" to "service_role";

grant delete on table "public"."tentativa_resposta" to "authenticated";

grant insert on table "public"."tentativa_resposta" to "authenticated";

grant references on table "public"."tentativa_resposta" to "authenticated";

grant select on table "public"."tentativa_resposta" to "authenticated";

grant trigger on table "public"."tentativa_resposta" to "authenticated";

grant truncate on table "public"."tentativa_resposta" to "authenticated";

grant update on table "public"."tentativa_resposta" to "authenticated";

grant delete on table "public"."tentativa_resposta" to "service_role";

grant insert on table "public"."tentativa_resposta" to "service_role";

grant select on table "public"."tentativa_resposta" to "service_role";

grant update on table "public"."tentativa_resposta" to "service_role";

grant delete on table "public"."user_conquista" to "authenticated";

grant insert on table "public"."user_conquista" to "authenticated";

grant references on table "public"."user_conquista" to "authenticated";

grant trigger on table "public"."user_conquista" to "authenticated";

grant truncate on table "public"."user_conquista" to "authenticated";

grant update on table "public"."user_conquista" to "authenticated";

grant delete on table "public"."user_conquista" to "service_role";

grant insert on table "public"."user_conquista" to "service_role";

grant select on table "public"."user_conquista" to "service_role";

grant update on table "public"."user_conquista" to "service_role";

grant delete on table "public"."user_gamificacao_stats" to "authenticated";

grant insert on table "public"."user_gamificacao_stats" to "authenticated";

grant references on table "public"."user_gamificacao_stats" to "authenticated";

grant trigger on table "public"."user_gamificacao_stats" to "authenticated";

grant truncate on table "public"."user_gamificacao_stats" to "authenticated";

grant update on table "public"."user_gamificacao_stats" to "authenticated";

grant delete on table "public"."user_gamificacao_stats" to "service_role";

grant insert on table "public"."user_gamificacao_stats" to "service_role";

grant select on table "public"."user_gamificacao_stats" to "service_role";

grant update on table "public"."user_gamificacao_stats" to "service_role";


  create policy "impersonation_log_select_admin"
  on "public"."admin_impersonation_log"
  as permissive
  for select
  to authenticated
using (public.is_admin());



  create policy "faq_admin_delete"
  on "public"."suporte_faq"
  as permissive
  for delete
  to authenticated
using (public.is_admin());



  create policy "faq_admin_insert"
  on "public"."suporte_faq"
  as permissive
  for insert
  to authenticated
with check (public.is_admin());



  create policy "faq_admin_update"
  on "public"."suporte_faq"
  as permissive
  for update
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "faq_select_authenticated"
  on "public"."suporte_faq"
  as permissive
  for select
  to authenticated
using (((ativo = true) OR public.is_admin()));



  create policy "mensagens_insert_own_ticket"
  on "public"."suporte_mensagens"
  as permissive
  for insert
  to authenticated
with check (((( SELECT auth.uid() AS uid) = autor_id) AND (public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suporte_tickets t
  WHERE ((t.id = suporte_mensagens.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));



  create policy "mensagens_select_own_ticket"
  on "public"."suporte_mensagens"
  as permissive
  for select
  to authenticated
using ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.suporte_tickets t
  WHERE ((t.id = suporte_mensagens.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "tickets_insert_own"
  on "public"."suporte_tickets"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "tickets_select_own"
  on "public"."suporte_tickets"
  as permissive
  for select
  to authenticated
using (((( SELECT auth.uid() AS uid) = user_id) OR public.is_admin()));



  create policy "tickets_update_admin"
  on "public"."suporte_tickets"
  as permissive
  for update
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "tentativa_insert_own"
  on "public"."tentativa"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "tentativa_update_own"
  on "public"."tentativa"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "tentativa_resposta_insert_own"
  on "public"."tentativa_resposta"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.tentativa t
  WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));



  create policy "tentativa_resposta_update_own"
  on "public"."tentativa_resposta"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.tentativa t
  WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));


CREATE TRIGGER trg_faq_atualizado_em BEFORE UPDATE ON public.suporte_faq FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

CREATE TRIGGER trg_tickets_atualizado_em BEFORE UPDATE ON public.suporte_tickets FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();


