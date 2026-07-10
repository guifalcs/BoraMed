import { test, expect } from '@playwright/test';
import { FlashcardsPage } from './pages/flashcards.page';

// ─── Dados de teste ──────────────────────────────────────────────────────────

const deckOficial = {
  id: 'deck-oficial-1',
  user_id: null,
  oficial: true,
  titulo: 'Farmacologia Básica',
  descricao: 'Cards de revisão de farmacologia.',
  publico: false,
  likes_count: 0,
  cards_count: 2,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

const cardsDoDeckOficial = [
  {
    id: 'card-1',
    deck_id: deckOficial.id,
    posicao: 0,
    frente: 'O que é meia-vida de eliminação?',
    verso: 'Tempo necessário para a concentração plasmática cair pela metade.',
    frente_imagem_url: null,
    verso_imagem_url: null,
    criado_em: '2024-01-01T00:00:00Z',
    atualizado_em: '2024-01-01T00:00:00Z',
  },
  {
    id: 'card-2',
    deck_id: deckOficial.id,
    posicao: 1,
    frente: 'O que é biodisponibilidade?',
    verso: 'Fração da dose administrada que atinge a circulação sistêmica.',
    frente_imagem_url: null,
    verso_imagem_url: null,
    criado_em: '2024-01-01T00:00:00Z',
    atualizado_em: '2024-01-01T00:00:00Z',
  },
];

const feedDeckMock = {
  id: 'deck-comunidade-1',
  titulo: 'Anatomia do Coração',
  descricao: 'Deck criado pela comunidade.',
  likes_count: 3,
  cards_count: 10,
  criado_em: '2024-02-01T00:00:00Z',
  autor_id: 'user-outro-1',
  autor_nome: 'Maria Estudante',
  curtido_por_mim: false,
};

const fakeUser = {
  id: 'user-test-flashcards',
  email: 'flashcards@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuário Flashcards' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const fakeProfile = {
  id: 'user-test-flashcards',
  nome_completo: 'Usuário Flashcards',
  email: 'flashcards@boramed.com',
  papel: 'aluno',
  avatar_url: null,
  tipo_usuario: null,
  periodo: null,
  faculdade_rede: null,
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

// ─── Token e sessão falsos (padrão canônico: pagamento.spec.ts) ─────────────

// O app usa `createBrowserClient` do @supabase/ssr (sessão em cookie, não
// localStorage) e roda com Angular SSR — injeção client-side chega tarde
// demais para o render SSR inicial. Ver memória `e2e-auth-via-cookie-ssr`.
test.use({ storageState: { cookies: [], origins: [] } });

const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-test-flashcards',
      email: 'flashcards@boramed.com',
      role: 'authenticated',
      exp: 9999999999,
    }),
  ) +
  '.fake-signature';

const SUPABASE_COOKIE_NAME = 'sb-127-auth-token';

// Unix timestamp para 2099-01-01T00:00:00Z.
const FAR_FUTURE_EXPIRES_AT = 4070908800;

const fakeSession = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FAR_FUTURE_EXPIRES_AT,
  refresh_token: 'fake-refresh-token',
  user: fakeUser,
};

/** Converte para base64url (RFC 4648 §5) sem padding — formato do @supabase/ssr. */
function toBase64URL(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64url');
}

const FAKE_COOKIE_VALUE = `base64-${toBase64URL(JSON.stringify(fakeSession))}`;

type PlaywrightPage = Parameters<typeof test>[1] extends { page: infer P } ? P : never;

/**
 * Injeta a sessão fake como cookie (formato @supabase/ssr), registra os mocks
 * de rede necessários ao módulo de Flashcards (perfil, paywall, decks, feed,
 * likes) e navega para a URL-alvo.
 */
async function setupMocksAndGoto(
  page: PlaywrightPage,
  targetUrl: string,
  options: { feed?: (typeof feedDeckMock)[] } = {},
): Promise<void> {
  const feed = options.feed ?? [feedDeckMock];

  await page.context().addCookies([
    {
      name: SUPABASE_COOKIE_NAME,
      value: FAKE_COOKIE_VALUE,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // Auth
  await page.route('**/auth/v1/user', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) });
  });

  await page.route('**/auth/v1/token**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: FAKE_ACCESS_TOKEN,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: FAR_FUTURE_EXPIRES_AT,
        refresh_token: 'fake-refresh-token',
        user: fakeUser,
      }),
    });
  });

  await page.route('**/auth/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Perfil (subscriptionGuard) e paywall (RPC tem_assinatura_ativa)
  await page.route('**/rest/v1/profiles**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeProfile) });
  });

  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(true) });
  });

  // REST: flashcard_decks — comportamento varia conforme a query
  await page.route('**/rest/v1/flashcard_decks**', (route) => {
    const url = route.request().url();

    // obterDeckComCards: select com embed de flashcard_cards + .single()
    if (url.includes('flashcard_cards')) {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...deckOficial, flashcard_cards: cardsDoDeckOficial }),
      });
      return;
    }

    // listarDecksOficiais
    if (url.includes('oficial=eq.true')) {
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([deckOficial]) });
      return;
    }

    // listarMeusDecks (oficial=eq.false)
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // RPC: feed da comunidade
  await page.route('**/rest/v1/rpc/flashcards_feed**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed) });
  });

  // RPC: toggle like
  await page.route('**/rest/v1/rpc/flashcards_toggle_like**', (route) => {
    const deck = feed[0];
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ curtido: !deck.curtido_por_mim, likes_count: deck.likes_count + 1 }),
    });
  });

  // Realtime WebSocket: aborta graciosamente
  await page.route('**/realtime/v1/**', (route) => {
    void route.abort();
  });

  await page.goto(targetUrl);
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Módulo de Flashcards', () => {
  test('aba oficiais lista o deck oficial mockado', async ({ page }) => {
    await setupMocksAndGoto(page, '/dashboard');
    const flashcards = new FlashcardsPage(page);
    await flashcards.goto();

    await expect(flashcards.deckCardByTitulo(deckOficial.titulo)).toBeVisible({ timeout: 10_000 });
  });

  test('estudar deck oficial: flip revela resposta, 1 acerto + 1 erro resulta em 50%', async ({ page }) => {
    await setupMocksAndGoto(page, '/dashboard');
    const flashcards = new FlashcardsPage(page);
    await flashcards.goto();

    await expect(flashcards.deckCardByTitulo(deckOficial.titulo)).toBeVisible({ timeout: 10_000 });
    await flashcards.estudarDeck(deckOficial.titulo);

    await expect(page).toHaveURL(new RegExp(`/dashboard/flashcards/${deckOficial.id}/estudar`), {
      timeout: 10_000,
    });

    // Card 1: os botões de resposta só aparecem após virar o card.
    await expect(flashcards.progresso).toHaveText('Card 1 de 2');
    await expect(flashcards.botaoAcertei).not.toBeVisible();

    await flashcards.virarCard();
    await expect(flashcards.botaoAcertei).toBeVisible();
    await expect(page.getByText(cardsDoDeckOficial[0].verso)).toBeVisible();
    await flashcards.botaoAcertei.click();

    // Card 2
    await expect(flashcards.progresso).toHaveText('Card 2 de 2');
    await flashcards.virarCard();
    await expect(flashcards.botaoErrei).toBeVisible();
    await flashcards.botaoErrei.click();

    await expect(flashcards.resumoTitulo).toBeVisible();
    await expect(flashcards.resumoTexto).toContainText('1 acertos');
    await expect(flashcards.resumoTexto).toContainText('1 erros');
    await expect(flashcards.resumoTexto).toContainText('50% de aproveitamento');
  });

  test('aba comunidade: curtir deck atualiza a contagem de likes de forma otimista', async ({ page }) => {
    await setupMocksAndGoto(page, '/dashboard');
    const flashcards = new FlashcardsPage(page);
    await flashcards.goto();

    await flashcards.irParaAba('comunidade');
    await expect(flashcards.deckCardByTitulo(feedDeckMock.titulo)).toBeVisible({ timeout: 10_000 });

    const likeButton = flashcards.likeButtonByTitulo(feedDeckMock.titulo);
    await expect(likeButton).toContainText(String(feedDeckMock.likes_count));

    await flashcards.curtirDeck(feedDeckMock.titulo);

    await expect(likeButton).toContainText(String(feedDeckMock.likes_count + 1));
  });
});
