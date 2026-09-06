-- ============================================================
-- Despesas da plataforma + resultado financeiro (receita − custo)
--
-- Até aqui o /admin/financeiro só enxergava a entrada (pagamentos aprovados).
-- Sem o outro lado não dá para responder "sobrou quanto?". Esta migration cria
-- o lançamento manual de gastos e a RPC que cruza receita líquida × despesa.
--
-- Decisões:
--   * Um lançamento = um gasto que aconteceu numa data (`competencia`). Custo
--     recorrente é lançado mês a mês; `recorrencia` é rótulo, não gerador —
--     nada é criado automaticamente, então não há risco de dupla contagem.
--   * Valor sempre em centavos de BRL. Gasto em dólar (OpenRouter, Vercel) é
--     lançado já convertido, com a cotação anotada em `observacao`.
--   * Receita usada no lucro é a LÍQUIDA (já sem a taxa do Mercado Pago), que é
--     o que de fato entrou na conta — mesma base do KPI "Líquido no mês".
-- ============================================================

CREATE TABLE IF NOT EXISTS public.despesa (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  descricao      text NOT NULL CHECK (length(btrim(descricao)) BETWEEN 1 AND 200),
  categoria      text NOT NULL
                   CHECK (categoria IN ('infraestrutura', 'ia', 'marketing', 'comissao',
                                        'ferramentas', 'conteudo', 'juridico_contabil',
                                        'impostos', 'equipamentos', 'outros')),
  fornecedor     text CHECK (fornecedor IS NULL OR length(btrim(fornecedor)) <= 120),
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  -- Data em que o gasto pertence ao caixa. É `date` (não timestamptz) porque a
  -- competência é uma decisão contábil, não o instante do lançamento.
  competencia    date NOT NULL,
  recorrencia    text NOT NULL DEFAULT 'unica'
                   CHECK (recorrencia IN ('unica', 'mensal', 'anual')),
  observacao     text CHECK (observacao IS NULL OR length(observacao) <= 1000)
);

ALTER TABLE public.despesa ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS despesa_competencia_idx ON public.despesa (competencia DESC);
CREATE INDEX IF NOT EXISTS despesa_categoria_idx   ON public.despesa (categoria);

-- Admin-only ponta a ponta: despesa é dado de sócio, não de usuário.
DROP POLICY IF EXISTS "despesa_select_admin" ON public.despesa;
CREATE POLICY "despesa_select_admin"
  ON public.despesa FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "despesa_insert_admin" ON public.despesa;
CREATE POLICY "despesa_insert_admin"
  ON public.despesa FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "despesa_update_admin" ON public.despesa;
CREATE POLICY "despesa_update_admin"
  ON public.despesa FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "despesa_delete_admin" ON public.despesa;
CREATE POLICY "despesa_delete_admin"
  ON public.despesa FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- `atualizado_em` no update; `criado_por` preenchido no insert quando omitido.
CREATE OR REPLACE FUNCTION public.despesa_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := COALESCE(NEW.criado_por, auth.uid());
  ELSE
    NEW.atualizado_em := now();
    NEW.criado_em     := OLD.criado_em;
    NEW.criado_por    := OLD.criado_por;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.despesa_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS despesa_touch_trg ON public.despesa;
CREATE TRIGGER despesa_touch_trg
  BEFORE INSERT OR UPDATE ON public.despesa
  FOR EACH ROW EXECUTE FUNCTION public.despesa_touch();

-- ============================================================
-- RPC: resultado financeiro (receita líquida × despesa)
-- ============================================================
-- `p_meses` controla o tamanho da série mensal (padrão 12). A série sempre
-- devolve o mês mesmo sem movimento, para o gráfico não ficar com buracos.
DROP FUNCTION IF EXISTS public.admin_get_resultado_financeiro(integer);
CREATE FUNCTION public.admin_get_resultado_financeiro(p_meses integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result      jsonb;
  inicio_mes  date := date_trunc('month', now())::date;
  meses       integer := LEAST(GREATEST(COALESCE(p_meses, 12), 1), 36);
  inicio_serie date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  inicio_serie := (inicio_mes - make_interval(months => meses - 1))::date;

  SELECT jsonb_build_object(
    'despesas_mes_centavos', COALESCE((
      SELECT sum(valor_centavos) FROM despesa WHERE competencia >= inicio_mes
    ), 0),
    'despesas_total_centavos', COALESCE((SELECT sum(valor_centavos) FROM despesa), 0),
    -- Custo fixo declarado no mês corrente: só os lançamentos marcados 'mensal'.
    'fixo_mensal_centavos', COALESCE((
      SELECT sum(valor_centavos) FROM despesa
      WHERE recorrencia = 'mensal' AND competencia >= inicio_mes
    ), 0),
    'receita_liquida_mes_centavos', COALESCE((
      SELECT sum(COALESCE(liquido_centavos, valor_centavos)) FROM pagamento
      WHERE status = 'approved' AND COALESCE(processado_em, criado_em) >= inicio_mes
    ), 0),
    'receita_liquida_total_centavos', COALESCE((
      SELECT sum(COALESCE(liquido_centavos, valor_centavos)) FROM pagamento
      WHERE status = 'approved'
    ), 0),
    'lancamentos', (SELECT count(*) FROM despesa),
    'por_categoria', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'categoria')
      FROM (
        SELECT jsonb_build_object(
                 'categoria', d.categoria,
                 'total_centavos', sum(d.valor_centavos),
                 'mes_centavos', COALESCE(sum(d.valor_centavos) FILTER (WHERE d.competencia >= inicio_mes), 0)
               ) AS x
        FROM despesa d
        GROUP BY d.categoria
      ) t
    ), '[]'::jsonb),
    'por_mes', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'mes', to_char(m.mes, 'YYYY-MM'),
                 'receita_liquida_centavos', r.receita,
                 'despesas_centavos', dsp.despesas,
                 'lucro_centavos', r.receita - dsp.despesas
               ) ORDER BY m.mes
             )
      FROM (
        SELECT g::date AS mes
        FROM generate_series(inicio_serie::timestamp, inicio_mes::timestamp, interval '1 month') AS g
      ) m
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(COALESCE(pg.liquido_centavos, pg.valor_centavos)), 0)::bigint AS receita
        FROM pagamento pg
        WHERE pg.status = 'approved'
          AND date_trunc('month', COALESCE(pg.processado_em, pg.criado_em))::date = m.mes
      ) r
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(d.valor_centavos), 0)::bigint AS despesas
        FROM despesa d
        WHERE date_trunc('month', d.competencia)::date = m.mes
      ) dsp
    ), '[]'::jsonb)
  ) INTO result;

  -- Lucro derivado aqui (e não no cliente) para que qualquer consumidor da RPC
  -- veja o mesmo número.
  result := result || jsonb_build_object(
    'lucro_mes_centavos',
      (result->>'receita_liquida_mes_centavos')::bigint - (result->>'despesas_mes_centavos')::bigint,
    'lucro_total_centavos',
      (result->>'receita_liquida_total_centavos')::bigint - (result->>'despesas_total_centavos')::bigint
  );

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_resultado_financeiro(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_resultado_financeiro(integer) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesa TO authenticated;
