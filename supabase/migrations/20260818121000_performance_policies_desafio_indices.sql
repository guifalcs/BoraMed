-- ═══════════════════════════════════════════════════════════════════════════
-- Performance: (1) wrapper (SELECT is_admin()) em 57 policies para avaliação
-- única por statement (initplan) em vez de por linha — is_admin() cru causou
-- 708 mil seq scans em profiles; (2) get_desafio_diario com early-return (era
-- a query mais cara do banco: sort de questao inteira em TODA chamada);
-- (3) índices de FK faltantes; (4) trigger anti-race de cupom; (5) índices
-- trigram para a busca textual admin.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Policies: is_admin() → (SELECT is_admin()) ──────────────────────────
-- Gerado mecanicamente a partir do pg_policies de PROD em 2026-08-18.
alter policy impersonation_log_select_admin on public.admin_impersonation_log using ((SELECT is_admin()));
alter policy alternativa_admin_delete on public.alternativa using ((SELECT is_admin()));
alter policy alternativa_admin_insert on public.alternativa with check ((SELECT is_admin()));
alter policy alternativa_admin_update on public.alternativa using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy avisos_admin_delete on public.avisos using ((SELECT is_admin()));
alter policy avisos_admin_insert on public.avisos with check ((SELECT is_admin()));
alter policy avisos_admin_update on public.avisos using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy avisos_select_authenticated on public.avisos using (((ativo = true) OR (SELECT is_admin())));
alter policy cupom_select_admin on public.cupom using ((SELECT is_admin()));
alter policy disciplina_admin_delete on public.disciplina using ((SELECT is_admin()));
alter policy disciplina_admin_insert on public.disciplina with check ((SELECT is_admin()));
alter policy disciplina_admin_update on public.disciplina using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy faculdade_admin_delete on public.faculdade using ((SELECT is_admin()));
alter policy faculdade_admin_insert on public.faculdade with check ((SELECT is_admin()));
alter policy faculdade_admin_update on public.faculdade using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy ia_agente_admin_delete on public.ia_agente using ((SELECT is_admin()));
alter policy ia_agente_admin_insert on public.ia_agente with check ((SELECT is_admin()));
alter policy ia_agente_admin_select on public.ia_agente using ((SELECT is_admin()));
alter policy ia_agente_admin_update on public.ia_agente using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy pagamento_intencao_select_own on public.pagamento_intencao using (((user_id = ( SELECT auth.uid() AS uid)) OR (SELECT is_admin())));
alter policy profiles_select on public.profiles using (((( SELECT auth.uid() AS uid) = id) OR (SELECT is_admin())));
alter policy prova_admin_delete on public.prova using ((SELECT is_admin()));
alter policy prova_admin_insert on public.prova with check ((SELECT is_admin()));
alter policy prova_admin_update on public.prova using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy prova_questao_admin_delete on public.prova_questao using ((SELECT is_admin()));
alter policy prova_questao_admin_insert on public.prova_questao with check ((SELECT is_admin()));
alter policy prova_questao_admin_update on public.prova_questao using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy questao_admin_delete on public.questao using ((SELECT is_admin()));
alter policy questao_admin_insert on public.questao with check ((SELECT is_admin()));
alter policy questao_admin_update on public.questao using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy questao_comentario_select on public.questao_comentario using (((status = 'ativo'::text) OR (user_id = ( SELECT auth.uid() AS uid)) OR (SELECT is_admin())));
alter policy questao_comentario_denuncia_select_admin on public.questao_comentario_denuncia using ((SELECT is_admin()));
alter policy questao_tema_admin_delete on public.questao_tema using ((SELECT is_admin()));
alter policy questao_tema_admin_insert on public.questao_tema with check ((SELECT is_admin()));
alter policy questao_tema_admin_update on public.questao_tema using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy suporte_anexos_insert_own_message on public.suporte_anexos with check (((user_id = ( SELECT auth.uid() AS uid)) AND (split_part(storage_path, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM (suporte_mensagens m
     JOIN suporte_tickets t ON ((t.id = m.ticket_id)))
  WHERE ((m.id = suporte_anexos.mensagem_id) AND (m.ticket_id = suporte_anexos.ticket_id) AND (m.autor_id = ( SELECT auth.uid() AS uid)) AND ((t.user_id = ( SELECT auth.uid() AS uid)) OR (SELECT is_admin())) AND (t.status <> 'resolvido'::text))))));
alter policy suporte_anexos_select_ticket on public.suporte_anexos using (((SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM suporte_tickets t
  WHERE ((t.id = suporte_anexos.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy faq_admin_delete on public.suporte_faq using ((SELECT is_admin()));
alter policy faq_admin_insert on public.suporte_faq with check ((SELECT is_admin()));
alter policy faq_admin_update on public.suporte_faq using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy faq_select_authenticated on public.suporte_faq using (((ativo = true) OR (SELECT is_admin())));
alter policy mensagens_insert_own_ticket on public.suporte_mensagens with check (((( SELECT auth.uid() AS uid) = autor_id) AND ((SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM suporte_tickets t
  WHERE ((t.id = suporte_mensagens.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));
alter policy mensagens_select_own_ticket on public.suporte_mensagens using (((SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM suporte_tickets t
  WHERE ((t.id = suporte_mensagens.ticket_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy tickets_select_own on public.suporte_tickets using (((( SELECT auth.uid() AS uid) = user_id) OR (SELECT is_admin())));
alter policy tickets_update_admin on public.suporte_tickets using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy tema_admin_delete on public.tema using ((SELECT is_admin()));
alter policy tema_admin_insert on public.tema with check ((SELECT is_admin()));
alter policy tema_admin_update on public.tema using ((SELECT is_admin())) with check ((SELECT is_admin()));
alter policy tentativa_select on public.tentativa using (((( SELECT auth.uid() AS uid) = user_id) OR (SELECT is_admin())));
alter policy tentativa_resposta_select on public.tentativa_resposta using (((SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM tentativa t
  WHERE ((t.id = tentativa_resposta.tentativa_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy avisos_imagens_admin_delete on storage.objects using (((bucket_id = 'avisos'::text) AND (SELECT is_admin())));
alter policy avisos_imagens_admin_insert on storage.objects with check (((bucket_id = 'avisos'::text) AND (SELECT is_admin())));
alter policy avisos_imagens_admin_update on storage.objects using (((bucket_id = 'avisos'::text) AND (SELECT is_admin()))) with check (((bucket_id = 'avisos'::text) AND (SELECT is_admin())));
alter policy questao_imagens_admin_delete on storage.objects using (((bucket_id = 'questao-imagens'::text) AND (SELECT is_admin())));
alter policy questao_imagens_admin_insert on storage.objects with check (((bucket_id = 'questao-imagens'::text) AND (SELECT is_admin())));
alter policy questao_imagens_admin_update on storage.objects using (((bucket_id = 'questao-imagens'::text) AND (SELECT is_admin()))) with check (((bucket_id = 'questao-imagens'::text) AND (SELECT is_admin())));
alter policy suporte_anexos_storage_select on storage.objects using (((bucket_id = 'suporte-anexos'::text) AND ((SELECT is_admin()) OR ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM (suporte_anexos a
     JOIN suporte_tickets t ON ((t.id = a.ticket_id)))
  WHERE ((a.storage_path = objects.name) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

-- ─── 2. get_desafio_diario: early-return quando o desafio de hoje já existe ─
-- Era a query mais cara do banco (207 s acumulados; 136 ms/chamada): o
-- INSERT ... ORDER BY dd.data ASC NULLS FIRST, random() varria e ordenava a
-- tabela questao inteira em TODA chamada, mesmo com o desafio já sorteado.
-- Agora o INSERT caro só roda na primeira chamada do dia.
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

  SELECT questao_id
  INTO v_questao_id
  FROM public.desafio_diario
  WHERE data = v_hoje;

  IF v_questao_id IS NULL THEN
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
  END IF;

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

-- ─── 3. Índices de FK faltantes (advisor 0001) ──────────────────────────────
create index if not exists idx_email_campanha_criado_por
  on public.email_campanha (criado_por);
create index if not exists idx_email_campanha_destinatario_user_id
  on public.email_campanha_destinatario (user_id);

-- ─── 4. Cupom: fecha race condition de limite de uso ────────────────────────
-- A validação (validar_cupom, COUNT) e a inserção em pagamento_intencao eram
-- statements separados: dois requests simultâneos passavam ambos na validação.
-- O trigger trava a linha do cupom (FOR UPDATE), serializando inserções
-- concorrentes do mesmo cupom, e reconta dentro da mesma transação.
create or replace function public.pagamento_intencao_valida_cupom()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cupom public.cupom%rowtype;
  v_qtd integer;
begin
  if new.cupom_id is null then
    return new;
  end if;

  -- Lock serializa inserções concorrentes com o mesmo cupom
  select * into v_cupom from public.cupom where id = new.cupom_id for update;
  if not found then
    raise exception 'cupom_invalido' using errcode = 'P0016';
  end if;

  if v_cupom.max_usos is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = new.cupom_id
        and pi.status not in ('recusada', 'expirada', 'cancelada');
    if v_qtd >= v_cupom.max_usos then
      raise exception 'cupom_esgotado' using errcode = 'P0016';
    end if;
  end if;

  if v_cupom.max_por_usuario is not null and new.user_id is not null then
    select count(*) into v_qtd from public.pagamento_intencao pi
      where pi.cupom_id = new.cupom_id
        and pi.user_id = new.user_id
        and pi.status not in ('recusada', 'expirada', 'cancelada');
    if v_qtd >= v_cupom.max_por_usuario then
      raise exception 'cupom_ja_usado' using errcode = 'P0016';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists pagamento_intencao_cupom_guard on public.pagamento_intencao;
create trigger pagamento_intencao_cupom_guard
  before insert on public.pagamento_intencao
  for each row execute function public.pagamento_intencao_valida_cupom();

-- ─── 5. Busca textual admin: índices trigram ────────────────────────────────
-- admin_buscar_questao_ids_por_texto faz ILIKE '%termo%' sobre
-- regexp_replace(col) — 728 ms/chamada por seq scan. Índices GIN trgm sobre
-- exatamente a mesma expressão da função tornam o ILIKE indexável.
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_questao_enunciado_trgm
  on public.questao using gin
  ((regexp_replace(enunciado, '\s+', ' ', 'g')) extensions.gin_trgm_ops);

create index if not exists idx_questao_enunciado_apoio_trgm
  on public.questao using gin
  ((regexp_replace(coalesce(enunciado_apoio, ''), '\s+', ' ', 'g')) extensions.gin_trgm_ops);

create index if not exists idx_alternativa_texto_trgm
  on public.alternativa using gin
  ((regexp_replace(texto, '\s+', ' ', 'g')) extensions.gin_trgm_ops);
