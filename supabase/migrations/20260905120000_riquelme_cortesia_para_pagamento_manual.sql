-- ============================================================
-- Riquelme Andrade Berto (bertoriquelme118@gmail.com): o acesso dele estava
-- marcado como CORTESIA, mas ele pagou por fora o preço do plano Essencial
-- Mensal. Cortesia fica fora de todas as métricas financeiras, então essa
-- receita real não aparecia.
--
-- Reclassifica a assinatura ativa como PAGA (cortesia = false) no plano
-- 'essencial-mensal' e registra o pagamento manual correspondente, mesma
-- semântica de admin_ativar_assinatura_manual (líquido = bruto, sem taxa de
-- gateway). O acesso não é encurtado: a validade concedida na cortesia é
-- mantida quando for maior que 1 mês.
--
-- Idempotente e sem efeito em ambientes onde o usuário não existe.
-- ============================================================

WITH alvo AS (
  SELECT a.id
  FROM public.assinatura a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.status = 'authorized'
    AND a.cortesia
    AND lower(p.email) = 'bertoriquelme118@gmail.com'
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

-- Registra o pagamento por fora (só se ainda não houver pagamento aprovado
-- nessa assinatura).
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
  AND lower(p.email) = 'bertoriquelme118@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.pagamento pg
    WHERE pg.assinatura_id = a.id AND pg.status = 'approved'
  );
