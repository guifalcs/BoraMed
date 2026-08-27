-- ============================================================================
-- Teste anti-regressão do público de campanha de e-mail.
--
-- POR QUE ESTE TESTE EXISTE
-- `public.email_publico_alvo` decide QUEM RECEBE e-mail em produção, e é uma
-- função que já foi reescrita inteira uma vez (20260827120000, para adicionar
-- `mais_ativos`). É exatamente o tipo de objeto que uma migration autogerada via
-- `supabase db pull`/`db diff` reemite na versão antiga — o mesmo acidente que
-- o `grants_gabarito_test.sql` documenta ter acontecido DUAS vezes com os grants
-- de gabarito. Uma regressão aqui é silenciosa: a tela do admin mostraria
-- "0 destinatários" para `mais_ativos` e ninguém saberia dizer se é o segmento
-- vazio ou a função velha.
--
-- O QUE ELE VALIDA (introspecção de catálogo + chamadas sem seed)
--   1. o CHECK de `email_campanha.segmento` aceita os cinco segmentos;
--   2. `email_publico_alvo` responde a cada um dos cinco (não estoura);
--   3. segmento inválido devolve VAZIO — nunca a base inteira;
--   4. a função continua exposta só para `service_role`.
--
-- O item 3 é o que mais importa: o `ELSE false` do CASE é a única coisa entre um
-- typo no segmento e um disparo para todos os alunos.
--
-- COMO RODAR (stack local, após `supabase start` + `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/campanha_segmento_test.sql
--
-- Falha => RAISE EXCEPTION => psql sai != 0 (quebra o CI).
-- ============================================================================

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────
-- 1) O CHECK aceita os cinco segmentos e recusa o resto
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_seg text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.email_campanha'::regclass
    and conname  = 'email_campanha_segmento_check';

  if v_def is null then
    raise exception 'CHECK email_campanha_segmento_check sumiu';
  end if;

  foreach v_seg in array array['sem_assinatura_ativa', 'nunca_assinou',
                               'ex_assinantes', 'todos', 'mais_ativos']
  loop
    if position(quote_literal(v_seg) in v_def) = 0 then
      raise exception 'CHECK do segmento não aceita %: %', v_seg, v_def;
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) A função responde a cada segmento, e 3) segmento inválido vem VAZIO
--
-- Base local é vazia, então o valor esperado dos cinco é 0 — o que se está
-- testando aqui é que a chamada não estoura (o ramo existe no CASE) e que o
-- inválido não cai em algum `true` por descuido. Com base populada, o item 3
-- continua valendo: inválido é sempre vazio.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_seg   text;
  v_total bigint;
begin
  foreach v_seg in array array['sem_assinatura_ativa', 'nunca_assinou',
                               'ex_assinantes', 'todos', 'mais_ativos']
  loop
    begin
      select count(*) into v_total from public.email_publico_alvo(v_seg);
    exception when others then
      raise exception 'email_publico_alvo(%) estourou: %', v_seg, sqlerrm;
    end;
  end loop;

  select count(*) into v_total from public.email_publico_alvo('segmento_inexistente');
  if v_total <> 0 then
    raise exception
      'email_publico_alvo com segmento inválido devolveu % linhas — o ELSE false do CASE se perdeu',
      v_total;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Continua exposta só para service_role
--
-- A lista de e-mails da base inteira não pode ficar a uma chamada de RPC de
-- distância para um usuário logado.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'public']
  loop
    if has_function_privilege(v_role, 'public.email_publico_alvo(text)', 'EXECUTE') then
      raise exception '% consegue executar email_publico_alvo — grant reaberto', v_role;
    end if;
  end loop;

  if not has_function_privilege('service_role', 'public.email_publico_alvo(text)', 'EXECUTE') then
    raise exception 'service_role perdeu o EXECUTE de email_publico_alvo — a edge function para de montar público';
  end if;
end $$;
