-- ============================================================================
-- Smoke test do módulo Flashcards (migration 20260711120000_flashcards.sql).
-- Roda contra o stack LOCAL após `supabase db reset` (usa admin do seed:
-- teste@boramed.com = 11111111-1111-1111-1111-111111111111, assinante ativo).
--
-- Como rodar:
--   docker exec -i supabase_db_ProjetoMed psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/flashcards_smoke_test.sql
-- ============================================================================

-- Cria um segundo usuário (não-admin) + assinatura ativa, para testar como
-- usuário comum sem depender do admin do seed.
DO $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'flashcard-tester@boramed.com',
    crypt('Teste123!', gen_salt('bf')), now(),
    '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Flashcard Tester"}',
    now(), now(), false, false
  ) ON CONFLICT (id) DO NOTHING;
END $$;

INSERT INTO public.assinatura (user_id, plano_id, status, proxima_cobranca, data_inicio)
SELECT '22222222-2222-2222-2222-222222222222', '99999999-0000-0000-0000-000000000001', 'authorized', now() + interval '90 days', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.assinatura WHERE user_id = '22222222-2222-2222-2222-222222222222' AND status = 'authorized'
);

-- Terceiro usuário: SEM assinatura (para testar bloqueio).
DO $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'flashcard-sem-assinatura@boramed.com',
    crypt('Teste123!', gen_salt('bf')), now(),
    '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Sem Assinatura"}',
    now(), now(), false, false
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 1 — contem_palavra_proibida funciona (sanity, superusuário ok aqui:
-- não é uma checagem de RLS, é lógica pura de função).
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT public.contem_palavra_proibida('que porra é essa') THEN
    RAISE EXCEPTION 'FALHOU: contem_palavra_proibida nao detectou palavra proibida';
  END IF;
  IF public.contem_palavra_proibida('titulo totalmente normal') THEN
    RAISE EXCEPTION 'FALHOU: contem_palavra_proibida detectou falso positivo';
  END IF;
  RAISE NOTICE 'OK contem_palavra_proibida';
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 2 — anon: sem grant, leitura deve falhar (insufficient_privilege).
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role anon;
DO $$
BEGIN
  PERFORM count(*) FROM public.flashcard_decks;
  RAISE EXCEPTION 'RLS FALHOU: anon conseguiu ler flashcard_decks';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK anon negado (insufficient_privilege)';
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 3 — usuário comum (assinante) cria deck com cards válidos.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_deck_id uuid;
  v_cards_count int;
BEGIN
  v_deck_id := public.flashcards_criar_deck(
    'Deck de teste smoke',
    'Descricao valida',
    true,
    '[{"frente":"Pergunta 1","verso":"Resposta 1"},{"frente":"Pergunta 2","verso":"Resposta 2"}]'::jsonb
  );
  IF v_deck_id IS NULL THEN
    RAISE EXCEPTION 'FALHOU: flashcards_criar_deck nao retornou id';
  END IF;
  SELECT cards_count INTO v_cards_count FROM public.flashcard_decks WHERE id = v_deck_id;
  IF v_cards_count <> 2 THEN
    RAISE EXCEPTION 'FALHOU: cards_count esperado=2 obtido=%', v_cards_count;
  END IF;
  RAISE NOTICE 'OK flashcards_criar_deck (deck=%, cards_count=%)', v_deck_id, v_cards_count;
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 4 — palavra proibida no titulo -> P0010.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.flashcards_criar_deck(
    'Titulo com porra no meio',
    NULL, false,
    '[{"frente":"a","verso":"b"}]'::jsonb
  );
  RAISE EXCEPTION 'FALHOU: deveria ter bloqueado por palavra proibida';
EXCEPTION
  WHEN sqlstate 'P0010' THEN
    RAISE NOTICE 'OK P0010 no titulo';
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 5 — usuário sem assinatura ativa é bloqueado (P0011).
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.flashcards_criar_deck('Deck sem assinatura', NULL, false, '[{"frente":"a","verso":"b"}]'::jsonb);
  RAISE EXCEPTION 'FALHOU: deveria ter bloqueado por falta de assinatura';
EXCEPTION
  WHEN sqlstate 'P0011' THEN
    RAISE NOTICE 'OK P0011 sem assinatura';
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 6 — limite de cards (0 e 201 cards devem falhar com P0006/P0004).
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.flashcards_criar_deck('Deck zero cards', NULL, false, '[]'::jsonb);
  RAISE EXCEPTION 'FALHOU: deveria ter bloqueado com 0 cards';
EXCEPTION
  WHEN sqlstate 'P0006' THEN
    RAISE NOTICE 'OK P0006 com 0 cards';
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 7 — like: cria deck público como user A, curte como user B, dono
-- (user A) consegue ver quem curtiu; user B não consegue curtir o próprio.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE v_deck_id uuid;
BEGIN
  v_deck_id := public.flashcards_criar_deck('Deck publico para likes', NULL, true, '[{"frente":"a","verso":"b"}]'::jsonb);
  PERFORM set_config('app.deck_id_teste', v_deck_id::text, false);
END $$;

-- o dono pode curtir o próprio deck (migration 20260712100000)
DO $$
DECLARE
  v_deck_id uuid := current_setting('app.deck_id_teste')::uuid;
  v_curtido boolean;
  v_likes int;
BEGIN
  SELECT curtido, likes_count INTO v_curtido, v_likes FROM public.flashcards_toggle_like(v_deck_id);
  IF NOT v_curtido OR v_likes <> 1 THEN
    RAISE EXCEPTION 'FALHOU: dono nao conseguiu curtir o proprio deck (curtido=%, likes=%)', v_curtido, v_likes;
  END IF;
  RAISE NOTICE 'OK dono pode curtir o proprio deck (likes_count=%)', v_likes;
END $$;

-- troca para admin (11111111...) e curte
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_deck_id uuid := current_setting('app.deck_id_teste')::uuid;
  v_curtido boolean;
  v_likes int;
BEGIN
  SELECT curtido, likes_count INTO v_curtido, v_likes FROM public.flashcards_toggle_like(v_deck_id);
  IF NOT v_curtido OR v_likes <> 2 THEN
    RAISE EXCEPTION 'FALHOU: like nao registrado corretamente (curtido=%, likes=%)', v_curtido, v_likes;
  END IF;
  RAISE NOTICE 'OK like registrado (likes_count=%)', v_likes;
END $$;

-- volta para dono do deck e lista quem curtiu
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_deck_id uuid := current_setting('app.deck_id_teste')::uuid;
  v_likes jsonb;
BEGIN
  v_likes := public.flashcards_listar_likes_deck(v_deck_id, 50, 0);
  IF jsonb_array_length(v_likes) <> 2 THEN
    RAISE EXCEPTION 'FALHOU: dono nao viu 2 curtidas, viu %', jsonb_array_length(v_likes);
  END IF;
  RAISE NOTICE 'OK dono ve quem curtiu (%)', v_likes;
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 8 — feed retorna decks públicos de usuários (não oficiais).
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_feed jsonb;
BEGIN
  PERFORM public.flashcards_criar_deck('Deck feed publico', NULL, true, '[{"frente":"a","verso":"b"}]'::jsonb);
  v_feed := public.flashcards_feed('recentes', 20, 0);
  IF jsonb_array_length(v_feed) < 1 THEN
    RAISE EXCEPTION 'FALHOU: feed vazio, esperava ao menos 1 deck publico';
  END IF;
  RAISE NOTICE 'OK feed retornou % decks', jsonb_array_length(v_feed);
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 9 — admin_get_flashcards_stats: nao-admin deve falhar; admin funciona.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.admin_get_flashcards_stats();
  RAISE EXCEPTION 'FALHOU: nao-admin conseguiu ler admin_get_flashcards_stats';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'OK nao-admin bloqueado em admin_get_flashcards_stats (%)', SQLERRM;
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
DO $$
DECLARE v_stats jsonb;
BEGIN
  v_stats := public.admin_get_flashcards_stats();
  IF v_stats IS NULL THEN
    RAISE EXCEPTION 'FALHOU: admin_get_flashcards_stats retornou null para admin';
  END IF;
  RAISE NOTICE 'OK admin_get_flashcards_stats: %', v_stats;
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 10 — paginacao do feed: 2 decks publicos, limit=1 deve retornar 1
-- elemento em cada pagina (offset 0 e offset 1), nao a lista inteira.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_pagina0 jsonb;
  v_pagina1 jsonb;
BEGIN
  PERFORM public.flashcards_criar_deck('Deck feed paginacao 1', NULL, true, '[{"frente":"a","verso":"b"}]'::jsonb);
  PERFORM public.flashcards_criar_deck('Deck feed paginacao 2', NULL, true, '[{"frente":"a","verso":"b"}]'::jsonb);

  v_pagina0 := public.flashcards_feed('recentes', 1, 0);
  IF jsonb_array_length(v_pagina0) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: pagina 0 deveria ter 1 item, teve %', jsonb_array_length(v_pagina0);
  END IF;

  v_pagina1 := public.flashcards_feed('recentes', 1, 1);
  IF v_pagina1 IS NULL OR jsonb_array_length(v_pagina1) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: pagina 1 deveria ter 1 item, teve %', v_pagina1;
  END IF;

  IF v_pagina0->0->>'id' = v_pagina1->0->>'id' THEN
    RAISE EXCEPTION 'FALHOU: pagina 0 e pagina 1 retornaram o mesmo deck';
  END IF;

  RAISE NOTICE 'OK paginacao do feed (pagina0=%, pagina1=%)', v_pagina0->0->>'titulo', v_pagina1->0->>'titulo';
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 11 — flashcards_atualizar_deck: dono atualiza titulo e substitui
-- cards (cards_count reflete a nova lista via trigger de recalculo).
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_deck_id uuid;
  v_cards_count int;
  v_titulo text;
BEGIN
  v_deck_id := public.flashcards_criar_deck('Deck original', NULL, false, '[{"frente":"a","verso":"b"}]'::jsonb);
  PERFORM public.flashcards_atualizar_deck(
    v_deck_id, 'Deck atualizado', 'nova descricao', true,
    '[{"frente":"a","verso":"b"},{"frente":"c","verso":"d"},{"frente":"e","verso":"f"}]'::jsonb
  );
  SELECT titulo, cards_count INTO v_titulo, v_cards_count FROM public.flashcard_decks WHERE id = v_deck_id;
  IF v_titulo <> 'Deck atualizado' OR v_cards_count <> 3 THEN
    RAISE EXCEPTION 'FALHOU: atualizar_deck nao aplicou mudancas (titulo=%, cards_count=%)', v_titulo, v_cards_count;
  END IF;
  RAISE NOTICE 'OK flashcards_atualizar_deck (titulo=%, cards_count=%)', v_titulo, v_cards_count;
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
-- TESTE 12 — flashcards_excluir_deck: usuario que nao e dono nem admin
-- recebe P0007.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
DO $$
DECLARE v_deck_id uuid;
BEGIN
  v_deck_id := public.flashcards_criar_deck('Deck de outro dono', NULL, false, '[{"frente":"a","verso":"b"}]'::jsonb);
  PERFORM set_config('app.deck_id_teste_excluir', v_deck_id::text, false);
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
DO $$
DECLARE v_deck_id uuid := current_setting('app.deck_id_teste_excluir')::uuid;
BEGIN
  PERFORM public.flashcards_excluir_deck(v_deck_id);
  RAISE EXCEPTION 'FALHOU: deveria ter bloqueado exclusao por nao-dono';
EXCEPTION
  WHEN sqlstate 'P0007' THEN
    RAISE NOTICE 'OK P0007 exclusao bloqueada para nao-dono';
END $$;
ROLLBACK;

\echo 'flashcards_smoke_test: TODOS OS CASOS PASSARAM'
