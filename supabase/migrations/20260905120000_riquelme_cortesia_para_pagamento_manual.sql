-- ============================================================
-- Riquelme Andrade Berto: acesso estava marcado como CORTESIA, mas ele pagou
-- por fora (PIX/dinheiro) o preço do plano Essencial Mensal. Cortesia fica fora
-- de todas as métricas financeiras, então a receita real dele não aparecia.
--
-- Reclassifica a assinatura ativa como PAGA (cortesia = false) no plano
-- 'essencial-mensal' e registra o pagamento manual correspondente, mesma
-- semântica de admin_ativar_assinatura_manual (líquido = bruto, sem taxa de
-- gateway). O acesso não é encurtado: a validade vira a maior entre a que ele
-- já tinha e 1 mês a partir do início.
--
-- Idempotente e sem efeito em ambientes onde o usuário não existe.
-- ============================================================

WITH alvo AS (
  SELECT a.id
  FROM public.assinatura a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.status = 'authorized'
    AND a.cortesia
    AND (p.nome_completo ILIKE '%riquelme%andrade%' OR p.email ILIKE '%riquelme%')
)
UPDATE public.assinatura a
   SET cortesia = false,
       plano_id = (SELECT id FROM public.plano WHERE slug = 'essencial-mensal'),
       data_inicio = COALESCE(a.data_inicio, a.criado_em),
       proxima_cobranca = GREATEST(
         COALESCE(a.proxima_cobranca, COALESCE(a.data_inicio, a.criado_em) + interval '1 month'),
         COALESCE(a.data_inicio, a.criado_em) + interval '1 month'
       )
  FROM alvo
 WHERE a.id = alvo.id;

-- Registra o pagamento por fora (só se ainda não houver pagamento aprovado).
INSERT INTO public.pagamento (
  user_id, assinatura_id, valor_centavos, liquido_centavos, moeda,
  status, metodo_pagamento, processado_em
)
SELECT
  a.user_id, a.id, pl.preco_centavos, pl.preco_centavos, COALESCE(pl.moeda, 'BRL'),
  'approved', 'manual', COALESCE(a.data_inicio, a.criado_em)
FROM public.assinatura a
JOIN public.profiles p ON p.id = a.user_id
JOIN public.plano pl ON pl.id = a.plano_id
WHERE a.status = 'authorized'
  AND NOT a.cortesia
  AND pl.slug = 'essencial-mensal'
  AND (p.nome_completo ILIKE '%riquelme%andrade%' OR p.email ILIKE '%riquelme%')
  AND NOT EXISTS (
    SELECT 1 FROM public.pagamento pg
    WHERE pg.assinatura_id = a.id AND pg.status = 'approved'
  );
