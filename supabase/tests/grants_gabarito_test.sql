-- ============================================================================
-- Teste anti-regressão de GRANTS/POLICIES — o gabarito e a nota do aluno.
--
-- POR QUE ESTE TESTE EXISTE
-- O hardening que esconde o gabarito não vive em código de aplicação: ele é um
-- recorte de privilégio no Postgres (SELECT por COLUNA em `questao`/
-- `alternativa`) somado à revogação da escrita em `tentativa[_resposta]`.
-- Esse tipo de estado é invisível num code review e JÁ FOI DESFEITO DUAS VEZES
-- por uma migration autogerada via `supabase db pull`/`db diff`, que reemite os
-- GRANTs default do schema:
--   * 20260612174550_sistema_suporte (autogerada) reexpôs o gabarito e reabriu
--     a escrita de tentativa;
--   * corrigido em 20260624125610_seguranca_revogar_gabarito_e_escrita_tentativa,
--     que já era a SEGUNDA correção da mesma falha (a 1ª foi 20260609130000).
-- Sem uma checagem automática, a 3ª regressão só apareceria em produção.
--
-- O QUE ELE VALIDA (introspecção de catálogo — sem seed, sem troca de role)
--   1. `authenticated`/`anon` NÃO leem as colunas de gabarito;
--   2. `authenticated`/`anon` NÃO escrevem em `tentativa`/`tentativa_resposta`;
--   3. as policies de SELECT de `questao`/`alternativa` exigem assinatura;
--   4. `anon` não lê `questao`/`alternativa` de forma alguma;
--   5. toda tabela do schema `public` tem RLS habilitada.
--
-- Usa has_column_privilege/has_table_privilege, que já consideram grants
-- herdados e grants a PUBLIC — não basta olhar information_schema.
--
-- COMO RODAR (stack local, após `supabase start` + `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/grants_gabarito_test.sql
--
-- Falha => RAISE EXCEPTION => psql sai != 0 (quebra o CI).
-- ============================================================================

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Colunas de gabarito invisíveis para authenticated e anon
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_falhas text := '';
  v_sumiram text := '';
begin
  for r in
    select *
    from (values
      ('public.alternativa', 'correta'),
      ('public.questao',     'resposta_correta_texto'),
      ('public.questao',     'respostas_aceitas'),
      ('public.questao',     'explicacao'),
      ('public.questao',     'explicacao_alternativas')
    ) as t(tabela, coluna)
  loop
    -- Uma coluna protegida que desaparece torna a checagem VAZIA — o teste
    -- passaria sem verificar nada. Se foi renomeada/removida de propósito,
    -- atualize esta lista junto; caso contrário é uma regressão de schema.
    if not exists (
      select 1 from information_schema.columns
      where table_schema = split_part(r.tabela, '.', 1)
        and table_name   = split_part(r.tabela, '.', 2)
        and column_name  = r.coluna
    ) then
      v_sumiram := v_sumiram || format(E'\n  - %s.%s', r.tabela, r.coluna);
      continue;
    end if;

    if has_column_privilege('authenticated', r.tabela, r.coluna, 'SELECT') then
      v_falhas := v_falhas || format(E'\n  - authenticated LÊ %s.%s', r.tabela, r.coluna);
    end if;
    if has_column_privilege('anon', r.tabela, r.coluna, 'SELECT') then
      v_falhas := v_falhas || format(E'\n  - anon LÊ %s.%s', r.tabela, r.coluna);
    end if;
  end loop;

  if v_falhas <> '' then
    raise exception E'REGRESSÃO DE GABARITO — colunas de resposta legíveis:%s\n\nCausa provável: uma migration autogerada (`db pull`/`db diff`) reemitiu `grant select on <tabela>` no nível da TABELA, o que anula o recorte por coluna. Reaplique o padrão de 20260624125610: `revoke select on <tabela> from authenticated, anon;` seguido de `grant select (<colunas seguras>) ...`.', v_falhas;
  end if;

  if v_sumiram <> '' then
    raise exception E'TESTE DESATUALIZADO — colunas protegidas que não existem mais:%s\n\nO teste não consegue mais verificar o que promete. Atualize a lista em supabase/tests/grants_gabarito_test.sql para refletir o schema atual.', v_sumiram;
  end if;

  raise notice 'OK 1/5 — colunas de gabarito ocultas para authenticated e anon';
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Sem escrita direta em tentativa / tentativa_resposta
--    (toda mutação passa por RPC SECURITY DEFINER que valida posse e estado)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_falhas text := '';
begin
  for r in
    select tabela, papel, priv
    from (values ('public.tentativa'), ('public.tentativa_resposta')) as t(tabela),
         (values ('authenticated'), ('anon')) as p(papel),
         (values ('INSERT'), ('UPDATE'), ('DELETE')) as v(priv)
  loop
    if has_table_privilege(r.papel, r.tabela, r.priv) then
      v_falhas := v_falhas || format(E'\n  - %s tem %s em %s', r.papel, r.priv, r.tabela);
    end if;
  end loop;

  if v_falhas <> '' then
    raise exception E'REGRESSÃO DE INTEGRIDADE DE NOTA — escrita direta liberada:%s\n\nCom escrita direta o aluno altera a própria nota/acertos/status (e `tentativa_resposta.correta`) via PostgREST, ignorando as RPCs. Reaplique: `revoke insert, update, delete, truncate on <tabela> from authenticated, anon;` e remova as policies de INSERT/UPDATE recriadas pelo diff.', v_falhas;
  end if;

  raise notice 'OK 2/5 — escrita direta em tentativa/tentativa_resposta bloqueada';
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Paywall na RLS: SELECT de questao/alternativa exige assinatura ativa
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_falhas text := '';
  v_qtd int;
begin
  for r in select unnest(array['questao', 'alternativa']) as tabela
  loop
    select count(*) into v_qtd
    from pg_policies
    where schemaname = 'public'
      and tablename = r.tabela
      and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') like '%tem_assinatura_ativa%';

    if v_qtd = 0 then
      v_falhas := v_falhas || format(
        E'\n  - %s: nenhuma policy de SELECT referencia tem_assinatura_ativa()', r.tabela);
    end if;
  end loop;

  if v_falhas <> '' then
    raise exception E'REGRESSÃO DE PAYWALL — leitura de conteúdo sem assinatura:%s\n\nSem esse gate, qualquer autenticado dumpa o acervo por GET /rest/v1/questao. Reaplique o padrão de 20260624131517: `alter policy <nome> on public.<tabela> using ((select public.tem_assinatura_ativa()));`', v_falhas;
  end if;

  raise notice 'OK 3/5 — policies de questao/alternativa exigem assinatura ativa';
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) anon não lê conteúdo de forma alguma
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  v_falhas text := '';
begin
  for r in select unnest(array['public.questao', 'public.alternativa']) as tabela
  loop
    if has_table_privilege('anon', r.tabela, 'SELECT') then
      v_falhas := v_falhas || format(E'\n  - anon tem SELECT em %s', r.tabela);
    end if;
  end loop;

  if v_falhas <> '' then
    raise exception E'REGRESSÃO — acervo exposto a usuários NÃO autenticados:%s', v_falhas;
  end if;

  raise notice 'OK 4/5 — anon sem SELECT em questao/alternativa';
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) RLS habilitada em todas as tabelas de `public`
--    (schema exposto na Data API: tabela sem RLS = tabela aberta)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_sem_rls text;
begin
  select string_agg(format(E'\n  - %s', c.relname), '' order by c.relname)
  into v_sem_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_sem_rls is not null then
    raise exception E'REGRESSÃO — tabelas em `public` SEM row level security:%s\n\nO schema `public` é exposto pela Data API; sem RLS a tabela fica legível/escrevível conforme os grants de anon/authenticated.', v_sem_rls;
  end if;

  raise notice 'OK 5/5 — RLS habilitada em todas as tabelas de public';
end $$;

do $$ begin raise notice E'\n✅ grants_gabarito_test: todos os invariantes de segurança passaram.'; end $$;
