-- ============================================================================
-- Plano Essencial: tier barato (só treinos nacionais, sem flashcards/materiais)
-- ao lado do tier Avançado (acesso completo) já existente.
--
-- 1) plano.tier: 'essencial' | 'avancado'. Planos atuais (mensal/semestral)
--    viram "Avançado" explicitamente no nome; novos planos essencial-mensal e
--    essencial-semestral entram no catálogo.
-- 2) assinatura_tier(uid): tier de acesso vigente do usuário (mesma semântica
--    de tem_assinatura_ativa quanto a proxima_cobranca, mas devolve o tier em
--    vez de um booleano). Cortesia (plano_id NULL) conta como 'avancado'.
-- 3) tem_acesso_avancado(uid): açúcar sintático para os gates de RLS/RPC que
--    hoje usam tem_assinatura_ativa e precisam virar tier-aware.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1) Coluna tier + reorganização do catálogo
-- ------------------------------------------------------------------
ALTER TABLE public.plano
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'avancado'
    CHECK (tier IN ('essencial', 'avancado'));

UPDATE public.plano SET nome = 'Avançado Mensal' WHERE slug = 'mensal';
UPDATE public.plano SET nome = 'Avançado Semestral' WHERE slug = 'semestral';

INSERT INTO public.plano
  (slug, nome, descricao, preco_centavos, frequency, frequency_type, tier, ativo, ordem)
VALUES
  ('essencial-mensal', 'Essencial Mensal',
   'Acesso aos treinos nacionais por 1 mês, sem renovação automática.',
   2990, 1, 'months', 'essencial', true, 0),
  ('essencial-semestral', 'Essencial Semestral',
   'Acesso aos treinos nacionais por 6 meses. Pague em até 6x sem juros.',
   11940, 6, 'months', 'essencial', true, 1)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.plano SET ordem = 2 WHERE slug = 'mensal';
UPDATE public.plano SET ordem = 3 WHERE slug = 'semestral';

-- Planos de pagamento único (recorrente = false), como os demais planos
-- essenciais/avançados criados após a virada para pagamento único.
UPDATE public.plano SET recorrente = false
  WHERE slug IN ('essencial-mensal', 'essencial-semestral');

-- ------------------------------------------------------------------
-- 2) assinatura_tier(uid): tier de acesso vigente
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assinatura_tier(uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.is_admin(uid) THEN 'avancado'
    ELSE (
      SELECT CASE WHEN a.plano_id IS NULL THEN 'avancado' ELSE p.tier END
      FROM public.assinatura a
      LEFT JOIN public.plano p ON p.id = a.plano_id
      WHERE a.user_id = uid
        AND a.status = 'authorized'
        AND (a.proxima_cobranca IS NULL OR a.proxima_cobranca > now())
      ORDER BY a.criado_em DESC
      LIMIT 1
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.assinatura_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assinatura_tier(uuid) TO authenticated;

-- ------------------------------------------------------------------
-- 3) tem_acesso_avancado(uid): sugar para os gates existentes
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tem_acesso_avancado(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.assinatura_tier(uid) = 'avancado';
$$;

REVOKE EXECUTE ON FUNCTION public.tem_acesso_avancado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_acesso_avancado(uuid) TO authenticated;
