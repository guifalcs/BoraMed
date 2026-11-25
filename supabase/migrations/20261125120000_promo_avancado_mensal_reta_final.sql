-- Promoção de reta final: Avançado Mensal cai de R$69,90 para R$49,90, o mesmo
-- valor mensal do Avançado Semestral (R$299,40 / 6).
--
-- `preco_original_centavos` guarda o preço cheio enquanto houver promoção. O
-- frontend usa a coluna só para exibir o "de" riscado e o selo de promoção; o
-- valor cobrado continua vindo de `preco_centavos`, lido pelas edge functions.
-- Para encerrar a promoção, no mesmo UPDATE:
--   set preco_centavos = 6990, preco_original_centavos = null
--
-- `plano` tem SELECT por tabela para `authenticated` (anon revogado em
-- 20260914184040), então a coluna nova já nasce visível para quem lê planos.

alter table public.plano
  add column if not exists preco_original_centavos integer;

alter table public.plano
  drop constraint if exists plano_preco_original_maior_check;

alter table public.plano
  add constraint plano_preco_original_maior_check
  check (preco_original_centavos is null or preco_original_centavos > preco_centavos);

comment on column public.plano.preco_original_centavos is
  'Preço cheio durante uma promoção (exibido riscado). NULL = sem promoção. O valor cobrado é sempre preco_centavos.';

update public.plano
   set preco_centavos = 4990,
       preco_original_centavos = 6990
 where slug = 'mensal';
