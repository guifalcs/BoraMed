-- ============================================================
-- Correção da migration anterior: o pagamento por fora do Riquelme Andrade
-- Berto (bertoriquelme118@gmail.com) foi do plano Essencial SEMESTRAL, não do
-- mensal. Ajusta o plano da assinatura ativa e o valor do pagamento manual
-- já registrado. A validade passa a ser de no mínimo 6 meses a partir do
-- início (a que ele já tinha é mantida quando maior).
--
-- Idempotente e sem efeito em ambientes onde o usuário não existe.
-- ============================================================

UPDATE public.assinatura a
   SET plano_id = (SELECT id FROM public.plano WHERE slug = 'essencial-semestral'),
       proxima_cobranca = GREATEST(
         COALESCE(a.proxima_cobranca, COALESCE(a.data_inicio, a.criado_em) + interval '6 months'),
         COALESCE(a.data_inicio, a.criado_em) + interval '6 months'
       )
  FROM public.profiles p, public.plano pl
 WHERE p.id = a.user_id
   AND pl.id = a.plano_id
   AND a.status = 'authorized'
   AND NOT a.cortesia
   AND pl.slug = 'essencial-mensal'
   AND lower(p.email) = 'bertoriquelme118@gmail.com';

UPDATE public.pagamento pg
   SET valor_centavos = pl.preco_centavos,
       liquido_centavos = pl.preco_centavos,
       moeda = COALESCE(pl.moeda, 'BRL')
  FROM public.assinatura a
  JOIN public.profiles p ON p.id = a.user_id
  JOIN public.plano pl ON pl.id = a.plano_id
 WHERE pg.assinatura_id = a.id
   AND pg.metodo_pagamento = 'manual'
   AND pg.status = 'approved'
   AND pl.slug = 'essencial-semestral'
   AND lower(p.email) = 'bertoriquelme118@gmail.com';
