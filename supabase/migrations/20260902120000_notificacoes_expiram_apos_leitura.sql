-- Notificações lidas deixam de ser exibidas 7 dias após a leitura,
-- evitando poluição da caixa de notificações do usuário.

-- ─── Coluna lida_em ───────────────────────────────────────────────────────────
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS lida_em TIMESTAMPTZ;

COMMENT ON COLUMN public.notificacoes.lida_em IS
  'Momento em que a notificação foi marcada como lida. Preenchido por trigger.';

-- Backfill: notificações já lidas usam a data de criação como referência
UPDATE public.notificacoes
SET lida_em = criado_em
WHERE lida = true
  AND lida_em IS NULL;

CREATE INDEX IF NOT EXISTS notificacoes_lida_em_idx
  ON public.notificacoes (lida_em)
  WHERE lida = true;

-- ─── Trigger: mantém lida_em coerente com lida ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notificacoes_set_lida_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.lida = true AND NEW.lida_em IS NULL THEN
    NEW.lida_em := NOW();
  ELSIF NEW.lida = false THEN
    NEW.lida_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notificacoes_lida_em_trg ON public.notificacoes;
CREATE TRIGGER notificacoes_lida_em_trg
  BEFORE INSERT OR UPDATE OF lida ON public.notificacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.notificacoes_set_lida_em();

-- ─── RPC: esconde notificações lidas há mais de 7 dias ────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_notificacoes(p_limit INT DEFAULT 20)
RETURNS SETOF public.notificacoes
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT *
  FROM public.notificacoes
  WHERE user_id = (SELECT auth.uid())
    AND (
      lida = false
      OR lida_em IS NULL
      OR lida_em > NOW() - INTERVAL '7 days'
    )
  ORDER BY criado_em DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_notificacoes(INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buscar_notificacoes(INT) TO authenticated;
