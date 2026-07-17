-- Reajuste de preços do tier Avançado (lançamento do plano Essencial):
-- mensal R$59,90 -> R$69,90; semestral R$240,00 -> R$299,40 (R$49,90/mês).
-- O preço é sempre lido desta tabela pelas edge functions no checkout.

update public.plano set preco_centavos = 6990 where slug = 'mensal';
update public.plano set preco_centavos = 29940 where slug = 'semestral';
