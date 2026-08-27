-- ============================================================
-- Campanhas de e-mail: segmento `mais_ativos`
--
-- Os quatro segmentos existentes recortam a base por ESTADO DE ASSINATURA —
-- servem para converter quem não paga. Faltava o recorte oposto: falar com quem
-- já usa. Este segmento pega os alunos com uso consistente nos últimos 14 dias,
-- para e-mail de reconhecimento/incentivo (a retenção de quem já está dentro
-- custa menos que a conversão de quem nunca entrou).
--
-- Definição de "interação": a MESMA de `admin_get_uso_plataforma()` e
-- `admin_get_uso_usuarios_dia()` — simulado iniciado (`tentativa.iniciada_em`)
-- + questão respondida (`tentativa_resposta.respondida_em`) —, acrescida do
-- desafio diário, que é uso real e não aparece em nenhuma das duas por ser um
-- fluxo à parte do simulado.
--
-- Limiares (≥20 interações E ≥3 dias distintos em 14 dias): os dois juntos são
-- de propósito. Só o volume deixaria passar quem despejou 40 questões numa
-- madrugada e sumiu; só os dias deixariam passar quem abriu o app três vezes
-- para responder uma questão. "Mais ativo" é quem volta E faz.
--
-- Dia em America/Sao_Paulo, como no resto do dashboard: em UTC a sessão da
-- madrugada brasileira cairia no dia seguinte e inflaria `dias`.
-- ============================================================

-- ============================================================
-- 1) CHECK do segmento
-- ============================================================
ALTER TABLE public.email_campanha
  DROP CONSTRAINT IF EXISTS email_campanha_segmento_check;

ALTER TABLE public.email_campanha
  ADD CONSTRAINT email_campanha_segmento_check
  CHECK (segmento IN ('sem_assinatura_ativa', 'nunca_assinou',
                      'ex_assinantes', 'todos', 'mais_ativos'));

-- ============================================================
-- 2) Definição única do público (prévia do admin + disparo real)
--
-- Reescrita completa da função de 20260730120000: as regras de elegibilidade da
-- base (papel/banido/optout/e-mail confirmado) seguem idênticas — só entra o
-- novo ramo do CASE e a CTE de atividade que ele consome.
--
-- O `p_segmento = 'mais_ativos'` repetido dentro da CTE `atividade` NÃO é
-- redundante com o CASE lá embaixo. A função é `SECURITY DEFINER`, e o Postgres
-- nunca faz inline de função SECURITY DEFINER: `p_segmento` continua sendo
-- parâmetro em tempo de execução, o CASE não dobra para uma constante e as
-- colunas de atividade seguem referenciadas — ou seja, o planner NÃO consegue
-- eliminar o LEFT JOIN. Sem essa guarda, escolher `todos` na tela do admin
-- passaria a agregar 14 dias de eventos de três tabelas à toa.
--
-- Com ela, o predicado vira One-Time Filter: o Postgres avalia uma vez por
-- execução e pula os scans inteiros nos outros quatro segmentos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.email_publico_alvo(p_segmento text)
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
  WITH atividade AS (
    SELECT
      e.user_id,
      count(*) AS interacoes,
      count(DISTINCT (timezone('America/Sao_Paulo', e.ts))::date) AS dias_ativos
    FROM (
      SELECT t.user_id, t.iniciada_em AS ts
      FROM public.tentativa t
      WHERE p_segmento = 'mais_ativos'
        AND t.iniciada_em >= now() - interval '14 days'
      UNION ALL
      SELECT t.user_id, tr.respondida_em
      FROM public.tentativa_resposta tr
      JOIN public.tentativa t ON t.id = tr.tentativa_id
      WHERE p_segmento = 'mais_ativos'
        AND tr.respondida_em >= now() - interval '14 days'
      UNION ALL
      SELECT d.user_id, d.respondido_em
      FROM public.desafio_diario_resposta d
      WHERE p_segmento = 'mais_ativos'
        AND d.respondido_em >= now() - interval '14 days'
    ) e
    GROUP BY e.user_id
  ),
  base AS (
    SELECT
      p.id,
      p.email,
      p.nome_completo,
      p.email_token,
      p.criado_em,
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
      ) AS ja_assinou,
      COALESCE(at.interacoes, 0)  AS interacoes_14d,
      COALESCE(at.dias_ativos, 0) AS dias_ativos_14d
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN atividade at ON at.user_id = p.id
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
    WHEN 'mais_ativos'          THEN b.interacoes_14d >= 20 AND b.dias_ativos_14d >= 3
    ELSE false
  END
  ORDER BY b.criado_em;
$$;

-- Nunca exposta ao cliente: só a edge function (service role) monta a lista.
REVOKE EXECUTE ON FUNCTION public.email_publico_alvo(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_publico_alvo(text) TO service_role;

-- ============================================================
-- 3) Índices de apoio
--
-- `email_publico_alvo('mais_ativos')` varre as três tabelas de evento por
-- janela de data. Sem índice em `iniciada_em`/`respondida_em` isso é seq scan em
-- `tentativa_resposta`, que é a tabela que mais cresce na plataforma.
--
-- Só `tentativa_resposta.respondida_em` é NULL-ável (resposta criada em branco e
-- nunca enviada), então é a única que ganha índice parcial — nas outras duas a
-- coluna é NOT NULL e o predicado seria sempre verdadeiro.
-- ============================================================
CREATE INDEX IF NOT EXISTS tentativa_iniciada_em_idx
  ON public.tentativa (iniciada_em);

CREATE INDEX IF NOT EXISTS tentativa_resposta_respondida_em_idx
  ON public.tentativa_resposta (respondida_em)
  WHERE respondida_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS desafio_diario_resposta_respondido_em_idx
  ON public.desafio_diario_resposta (respondido_em);
