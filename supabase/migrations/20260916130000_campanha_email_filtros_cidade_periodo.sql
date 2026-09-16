-- ============================================================
-- Campanha de e-mail: filtros combináveis de cidade (unidade) e período
--
-- Objetivo: hoje o admin só escolhe um segmento inteiro. Faltava cruzar isso
-- com "só quem está em Ipatinga" ou "só o 3º período" — e poder combinar os
-- dois ("1º período em Salvador"), do jeito que o dashboard já cruza no
-- gráfico (admin_get_distribuicao_periodo_unidade).
--
-- `p_cidades`/`p_periodos` são filtros ADICIONAIS (AND), aplicados em cima de
-- QUALQUER segmento — inclusive 'lista_manual', onde reduzem ainda mais a
-- lista colada pelo admin. NULL ou array vazio = sem filtro (comportamento
-- idêntico ao de antes desta migration).
-- ============================================================

-- Assinatura muda (dois parâmetros novos): precisa dropar antes do
-- CREATE OR REPLACE, mesmo motivo de 20260911130000 (default tornaria a
-- chamada de 1-2 argumentos ambígua entre as versões).
DROP FUNCTION IF EXISTS public.email_publico_alvo(text, text[]);
DROP FUNCTION IF EXISTS public.admin_contar_publico_email(text, text[]);

CREATE OR REPLACE FUNCTION public.email_publico_alvo(
  p_segmento text,
  p_emails   text[]     DEFAULT NULL,
  p_cidades  text[]     DEFAULT NULL,
  p_periodos smallint[] DEFAULT NULL
)
RETURNS TABLE (
  user_id        uuid,
  email          text,
  nome_completo  text,
  email_token    uuid,
  criado_em      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      p.id,
      p.email,
      p.nome_completo,
      p.email_token,
      p.criado_em,
      p.faculdade_unidade,
      p.periodo,
      EXISTS (
        SELECT 1 FROM public.assinatura a
        WHERE a.user_id = p.id
          AND (
            (a.status = 'authorized' AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now()))
            OR (a.status = 'cancelled' AND a.proxima_cobranca IS NOT NULL AND a.proxima_cobranca > now())
          )
      ) AS tem_ativa,
      EXISTS (
        -- 'pending' = abriu o checkout e nunca pagou → continua contando como
        -- "nunca assinou". Só status efetivados marcam histórico de assinante.
        SELECT 1 FROM public.assinatura a
        WHERE a.user_id = p.id
          AND a.status IN ('authorized', 'paused', 'cancelled')
      ) AS ja_assinou
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.papel = 'aluno'
      AND p.banido = false
      AND p.email_marketing_optout = false
      AND p.email IS NOT NULL
      AND p.email <> ''
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
  )
  SELECT b.id, b.email, b.nome_completo, b.email_token, b.criado_em
  FROM base b
  WHERE CASE p_segmento
    WHEN 'sem_assinatura_ativa' THEN NOT b.tem_ativa
    WHEN 'nunca_assinou'        THEN NOT b.tem_ativa AND NOT b.ja_assinou
    WHEN 'ex_assinantes'        THEN NOT b.tem_ativa AND b.ja_assinou
    WHEN 'todos'                THEN true
    WHEN 'lista_manual'         THEN lower(b.email) = ANY (SELECT lower(e) FROM unnest(p_emails) e)
    ELSE false
  END
  -- array vazio (frontend manda [] para "nenhum filtro") equivale a NULL.
  AND (p_cidades  IS NULL OR array_length(p_cidades,  1) IS NULL OR b.faculdade_unidade = ANY (p_cidades))
  AND (p_periodos IS NULL OR array_length(p_periodos, 1) IS NULL OR b.periodo = ANY (p_periodos))
  ORDER BY b.criado_em;
$$;

CREATE OR REPLACE FUNCTION public.admin_contar_publico_email(
  p_segmento text,
  p_emails   text[]     DEFAULT NULL,
  p_cidades  text[]     DEFAULT NULL,
  p_periodos smallint[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.email_publico_alvo(p_segmento, p_emails, p_cidades, p_periodos);
  RETURN v_total;
END;
$$;

-- Grants perdidos no drop+create (assinatura nova é um objeto novo).
REVOKE EXECUTE ON FUNCTION public.email_publico_alvo(text, text[], text[], smallint[])
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_publico_alvo(text, text[], text[], smallint[])
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_contar_publico_email(text, text[], text[], smallint[])
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_contar_publico_email(text, text[], text[], smallint[])
  TO authenticated;

-- ============================================================
-- Histórico: registrar quais filtros foram usados no disparo
--
-- Não afeta idempotência/retomada — "Retomar" reprocessa
-- email_campanha_destinatario já gravado, nunca re-executa o filtro. Isto é
-- só para a tela do admin mostrar "Ipatinga · 3º período" no histórico em vez
-- de só o segmento.
-- ============================================================
ALTER TABLE public.email_campanha
  ADD COLUMN IF NOT EXISTS cidades  text[],
  ADD COLUMN IF NOT EXISTS periodos smallint[];

-- RETURNS TABLE ganhou colunas: CREATE OR REPLACE não aceita mudar o tipo de
-- retorno de uma função existente, precisa dropar antes.
DROP FUNCTION IF EXISTS public.admin_listar_campanhas_email(integer);

CREATE OR REPLACE FUNCTION public.admin_listar_campanhas_email(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id                  uuid,
  criado_em           timestamptz,
  nome                text,
  assunto             text,
  segmento            text,
  cidades             text[],
  periodos            smallint[],
  status              text,
  total_destinatarios integer,
  total_enviados      integer,
  total_falhas        integer,
  total_cancelados    integer,
  erro                text,
  criado_por_email    text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.criado_em, c.nome, c.assunto, c.segmento, c.cidades, c.periodos, c.status,
    c.total_destinatarios, c.total_enviados, c.total_falhas, c.total_cancelados, c.erro,
    p.email
  FROM public.email_campanha c
  LEFT JOIN public.profiles p ON p.id = c.criado_por
  ORDER BY c.criado_em DESC
  LIMIT greatest(1, least(p_limit, 200));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_campanhas_email(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_campanhas_email(integer) TO authenticated;
