import { test, expect } from '@playwright/test';

// ─── Dados de teste ──────────────────────────────────────────────────────────

const provaMocks = [
  {
    id: 'prova-1',
    faculdade_id: 'fac-1',
    nome: 'Prova N1 2024 — 1º Período',
    periodo: 1,
    ano: 2024,
    semestre: 1,
    tipo: 'nacional',
    subtipo_nacional: 'N1',
    qtd_questoes: 30,
    tempo_sugerido_minutos: 60,
    criado_em: '2024-01-01T00:00:00Z',
  },
  {
    id: 'prova-2',
    faculdade_id: 'fac-1',
    nome: 'Prova N2 2024 — 4º Período',
    periodo: 4,
    ano: 2024,
    semestre: 2,
    tipo: 'nacional',
    subtipo_nacional: 'N2',
    qtd_questoes: 40,
    tempo_sugerido_minutos: 90,
    criado_em: '2024-07-01T00:00:00Z',
  },
  {
    id: 'prova-3',
    faculdade_id: 'fac-1',
    nome: 'Teste de Progresso 2023 — 6º Período',
    periodo: 6,
    ano: 2023,
    semestre: 1,
    tipo: 'nacional',
    subtipo_nacional: 'teste_progresso',
    qtd_questoes: 50,
    tempo_sugerido_minutos: 120,
    criado_em: '2023-01-01T00:00:00Z',
  },
  {
    id: 'prova-4',
    faculdade_id: 'fac-1',
    nome: 'Prova N1 2023 — 1º Período',
    periodo: 1,
    ano: 2023,
    semestre: 1,
    tipo: 'nacional',
    subtipo_nacional: 'N1',
    qtd_questoes: 30,
    tempo_sugerido_minutos: 60,
    criado_em: '2023-01-01T00:00:00Z',
  },
];

const fakeUser = {
  id: 'user-test-1',
  email: 'teste@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuário de Teste' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

// ─── Configuração: sem estado de auth salvo, usamos page.route() ─────────────

// Override storageState so we don't depend on the auth setup fixture.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A fake JWT-format access token (structure only, not cryptographically valid).
 * The Supabase SDK will send this as a Bearer header when making requests.
 * We intercept all auth endpoints so the server never actually validates it.
 */
const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({ sub: 'user-test-1', email: 'teste@boramed.com', role: 'authenticated', exp: 9999999999 })) +
    '.fake-signature';

/**
 * A minimal serialised Supabase session stored under the key the SDK expects.
 * Key format for localhost:54321 is "sb-127-auth-token".
 */
const SUPABASE_STORAGE_KEY = 'sb-127-auth-token';

const fakeSession = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'fake-refresh-token',
  user: fakeUser,
};

/**
 * Intercepts all Supabase network calls needed for an authenticated session
 * and mocks the prova REST endpoint with the provided data.
 *
 * Strategy:
 *  1. Set localStorage with a fake session BEFORE page navigation so the
 *     Supabase SDK finds a stored session on boot.
 *  2. Intercept GET /auth/v1/user so the SDK's getUser() call (from
 *     AuthService.initialize()) returns our fake user.
 *  3. Intercept POST /auth/v1/token to handle any token refresh.
 *  4. Intercept GET /rest/v1/prova to return mock prova data.
 */
async function setupMocks(
  page: Parameters<typeof test>[1] extends ({ page: infer P }) ? P : never,
  provas: typeof provaMocks = provaMocks,
) {
  // Auth: GET /auth/v1/user — AuthService.initialize() calls this
  await page.route('**/auth/v1/user', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeUser),
    });
  });

  // Auth: POST /auth/v1/token — token refresh calls
  await page.route('**/auth/v1/token**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: FAKE_ACCESS_TOKEN,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser,
      }),
    });
  });

  // Auth: any remaining auth endpoints
  await page.route('**/auth/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // REST: prova table — returns our mock data array
  await page.route('**/rest/v1/prova**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(provas),
    });
  });

  // Realtime WebSocket: abort gracefully
  await page.route('**/realtime/v1/**', (route) => {
    void route.abort();
  });

  // Navigate to the app first to get a page context, then inject localStorage
  // We need to go to the base URL to set localStorage before any redirect
  await page.goto('/login');

  // Inject the fake session into localStorage so the Supabase SDK picks it up
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [SUPABASE_STORAGE_KEY, JSON.stringify(fakeSession)] as [string, string],
  );
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Módulo de Provas', () => {
  test.describe('Página inicial de Provas (/dashboard/provas)', () => {
    test('navegar para /dashboard/provas mostra o card da Rede Afya', async ({ page }) => {
      await setupMocks(page);
      await page.goto('/dashboard/provas');

      await expect(page.getByRole('heading', { name: 'Rede Afya' })).toBeVisible({ timeout: 10_000 });
    });

    test('clicar no card da Afya navega para /dashboard/provas/afya', async ({ page }) => {
      await setupMocks(page);
      await page.goto('/dashboard/provas');

      await page.getByRole('link', { name: /Rede Afya/ }).click();

      await expect(page).toHaveURL(/\/dashboard\/provas\/afya/, { timeout: 10_000 });
    });
  });

  test.describe('Lista de provas da Afya (/dashboard/provas/afya)', () => {
    test.beforeEach(async ({ page }) => {
      await setupMocks(page);
      await page.goto('/dashboard/provas/afya');
      // Wait for loading skeleton to disappear (first app-prova-card means loaded)
      await page.waitForSelector('app-prova-card', { timeout: 10_000 });
    });

    test('provas são listadas após carregar', async ({ page }) => {
      const cards = page.locator('app-prova-card');
      await expect(cards).toHaveCount(provaMocks.length);
    });

    test('exibe o título da página', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Rede Afya — Nacional' })).toBeVisible();
    });

    test('link de voltar para /dashboard/provas está presente', async ({ page }) => {
      // There are two "Provas" links on the page (nav sidebar + back link in content).
      // Assert the back link inside the main content area.
      await expect(page.getByRole('main').getByRole('link', { name: /Provas/ })).toBeVisible();
    });

    test.describe('Filtro por tipo (subtipo_nacional)', () => {
      test('filtrar por N1 mostra apenas provas N1', async ({ page }) => {
        // The N1 filter option in the select
        const tipoSelect = page.locator('[aria-label="Tipo"]');
        await tipoSelect.click();

        const n1Option = page.getByRole('listbox', { name: 'Tipo' }).getByText('N1', { exact: true });
        await n1Option.click();

        // Wait for the list to update
        await page.waitForTimeout(300);

        const cards = page.locator('app-prova-card');
        const n1Provas = provaMocks.filter((p) => p.subtipo_nacional === 'N1');
        await expect(cards).toHaveCount(n1Provas.length);
      });

      test('filtrar por N1 não exibe provas N2 ou TP', async ({ page }) => {
        const tipoSelect = page.locator('[aria-label="Tipo"]');
        await tipoSelect.click();

        await page.getByRole('listbox', { name: 'Tipo' }).getByText('N1', { exact: true }).click();
        await page.waitForTimeout(300);

        // Only N1 provas should be visible — check that N2 names are absent
        await expect(page.getByText('Prova N2 2024')).not.toBeVisible();
        await expect(page.getByText('Teste de Progresso 2023')).not.toBeVisible();
      });
    });

    test.describe('Filtro por período', () => {
      test('filtrar por período 1 mostra apenas provas do período 1', async ({ page }) => {
        const periodoSelect = page.locator('[aria-label="Período"]');
        await periodoSelect.click();

        await page
          .getByRole('listbox', { name: 'Período' })
          .getByText('1º período', { exact: true })
          .click();
        await page.waitForTimeout(300);

        const cards = page.locator('app-prova-card');
        const periodo1Provas = provaMocks.filter((p) => p.periodo === 1);
        await expect(cards).toHaveCount(periodo1Provas.length);
      });

      test('filtrar por período 4 exibe a prova N2 do 4º período', async ({ page }) => {
        const periodoSelect = page.locator('[aria-label="Período"]');
        await periodoSelect.click();

        await page
          .getByRole('listbox', { name: 'Período' })
          .getByText('4º período', { exact: true })
          .click();
        await page.waitForTimeout(300);

        await expect(page.getByText('Prova N2 2024 — 4º Período')).toBeVisible();
      });
    });
  });

  test.describe('Estado vazio', () => {
    test('exibe empty state quando não há provas disponíveis', async ({ page }) => {
      await setupMocks(page, []);
      await page.goto('/dashboard/provas/afya');

      await expect(page.locator('app-empty-state')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('app-prova-card')).toHaveCount(0);
    });
  });
});
