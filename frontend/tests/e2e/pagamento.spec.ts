import { test, expect } from '@playwright/test';

// ─── Dados de teste ──────────────────────────────────────────────────────────

// Catálogo com os 2 tiers (Essencial/Avançado) — a página de planos foi
// redesenhada para exibir os 2 cards lado a lado (ver planos.component.ts),
// então o mock precisa dos 4 planos mesmo quando o teste só olha para 1 deles.
const planoMocks = [
  {
    id: 'plano-essencial-mensal-1',
    slug: 'essencial-mensal',
    nome: 'Essencial Mensal',
    descricao: 'Acesso aos treinos nacionais por 1 mês, sem renovação automática.',
    preco_centavos: 2390,
    moeda: 'BRL',
    frequency: 1,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 0,
    tier: 'essencial',
  },
  {
    id: 'plano-essencial-semestral-1',
    slug: 'essencial-semestral',
    nome: 'Essencial Semestral',
    descricao: 'Acesso aos treinos nacionais por 6 meses. Pague em até 6x sem juros.',
    preco_centavos: 8340,
    moeda: 'BRL',
    frequency: 6,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 1,
    tier: 'essencial',
  },
  {
    id: 'plano-mensal-1',
    slug: 'mensal',
    nome: 'Avançado Mensal',
    descricao: 'Acesso completo por 1 mês, sem renovação automática',
    preco_centavos: 6990,
    moeda: 'BRL',
    frequency: 1,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 2,
    tier: 'avancado',
  },
  {
    id: 'plano-semestral-1',
    slug: 'semestral',
    nome: 'Avançado Semestral',
    descricao: 'Melhor custo-benefício por 6 meses',
    preco_centavos: 29940,
    moeda: 'BRL',
    frequency: 6,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 3,
    tier: 'avancado',
  },
];

const fakeUser = {
  id: 'user-test-pagamento',
  email: 'pagamento@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuário Pagamento' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const fakeProfile = {
  id: 'user-test-pagamento',
  nome_completo: 'Usuário Pagamento',
  email: 'pagamento@boramed.com',
  papel: 'aluno',
  avatar_url: null,
  tipo_usuario: null,
  periodo: null,
  faculdade_rede: null,
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

// ─── Token e sessão falsos ────────────────────────────────────────────────────

// Override storageState so we don't depend on the auth setup fixture.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A fake JWT-format access token (structure only, not cryptographically valid).
 * The Supabase SDK sends this as a Bearer header; all auth endpoints are
 * intercepted so the server never validates the signature.
 */
const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-test-pagamento',
      email: 'pagamento@boramed.com',
      role: 'authenticated',
      exp: 9999999999,
    }),
  ) +
  '.fake-signature';

/**
 * The app uses `createBrowserClient` from `@supabase/ssr`, which stores
 * sessions in **cookies** (not localStorage). The cookie name is the same
 * `sb-127-auth-token` key, but the value must be base64url-encoded with a
 * `base64-` prefix as required by the @supabase/ssr cookie storage format.
 *
 * Cookie format: `base64-<base64url(JSON.stringify(session))>`
 *
 * Encoding: base64url (RFC 4648 §5, no padding — uses - and _ instead of + and /).
 */
const SUPABASE_COOKIE_NAME = 'sb-127-auth-token';

// Unix timestamp for 2099-01-01T00:00:00Z — well past any reasonable test window.
const FAR_FUTURE_EXPIRES_AT = 4070908800;

const fakeSession = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FAR_FUTURE_EXPIRES_AT,
  refresh_token: 'fake-refresh-token',
  user: fakeUser,
};

/**
 * Converts a string to base64url (RFC 4648 §5) without padding.
 * Mirrors the `stringToBase64URL` implementation inside @supabase/ssr.
 */
function toBase64URL(str: string): string {
  // In the browser context (addInitScript) we can't use Node's Buffer, so
  // we compute this value here (Node environment) and pass the pre-encoded
  // string to addInitScript.
  return Buffer.from(str, 'utf8').toString('base64url');
}

/** The cookie value expected by @supabase/ssr createBrowserClient. */
const FAKE_COOKIE_VALUE = `base64-${toBase64URL(JSON.stringify(fakeSession))}`;

// ─── Helper ───────────────────────────────────────────────────────────────────

type PlaywrightPage = Parameters<typeof test>[1] extends { page: infer P } ? P : never;

/**
 * Injeta a sessão fake como cookie (formato esperado por @supabase/ssr
 * createBrowserClient), registra os mocks de rede e navega para a URL-alvo.
 *
 * O `@supabase/ssr` usa cookies (via document.cookie) em vez de localStorage,
 * por isso precisamos de page.context().addCookies() em vez de addInitScript
 * ou page.evaluate().
 *
 * @param page         instância da página do Playwright
 * @param targetUrl    URL de destino (ex.: '/planos', '/assinatura/retorno?...')
 * @param rpcReturns   valor que o RPC `tem_assinatura_ativa` deve retornar
 * @param extraRoutes  callback opcional para rotas adicionais (ex.: mp-criar-assinatura)
 */
async function setupMocksAndGoto(
  page: PlaywrightPage,
  targetUrl: string,
  rpcReturns: boolean = false,
  extraRoutes?: (page: PlaywrightPage) => Promise<void>,
): Promise<void> {
  // ── 1. Injeta a sessão como cookie antes de qualquer navegação ───────────
  //    O @supabase/ssr createBrowserClient lê de document.cookie, não de
  //    localStorage. O cookie precisa estar disponível antes do primeiro
  //    request da página para que o SDK inicialize com a sessão correta.
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

  // ── 2. Registra os mocks de rede ─────────────────────────────────────────

  // Auth: GET /auth/v1/user — chamado por supabase.auth.getUser()
  await page.route('**/auth/v1/user', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeUser),
    });
  });

  // Auth: POST /auth/v1/token — refresh de token
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

  // Auth: qualquer outro endpoint de auth
  await page.route('**/auth/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // REST: tabela profiles — ProfileService.loadProfile()
  await page.route('**/rest/v1/profiles**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeProfile),
    });
  });

  // REST: RPC tem_assinatura_ativa — SubscriptionService.temAssinaturaAtivaServidor()
  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rpcReturns),
    });
  });

  // REST: tabela plano — SubscriptionService.listarPlanos()
  await page.route('**/rest/v1/plano**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(planoMocks),
    });
  });

  // REST: tabela assinatura — SubscriptionService.carregarAssinatura()
  await page.route('**/rest/v1/assinatura**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    });
  });

  // Functions: mp-vincular-assinatura
  await page.route('**/functions/v1/mp-vincular-assinatura**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Realtime WebSocket: aborta graciosamente
  await page.route('**/realtime/v1/**', (route) => {
    void route.abort();
  });

  // Rotas extras específicas do teste (ex.: mp-criar-assinatura)
  if (extraRoutes) {
    await extraRoutes(page);
  }

  // ── 3. Navega diretamente para a URL-alvo ────────────────────────────────
  await page.goto(targetUrl);
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Módulo de Pagamento', () => {
  test.describe('Página de Planos (/planos)', () => {
    test('lista os planos retornados pela API (Essencial e Avançado, ciclo semestral padrão)', async ({ page }) => {
      await setupMocksAndGoto(page, '/planos');

      await expect(page.getByRole('heading', { name: 'Essencial Semestral' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('heading', { name: 'Avançado Semestral' })).toBeVisible({
        timeout: 10_000,
      });
    });

    test('exibe um botão "Assinar" para cada tier listado', async ({ page }) => {
      await setupMocksAndGoto(page, '/planos');

      await expect(page.getByRole('heading', { name: 'Essencial Semestral' })).toBeVisible({
        timeout: 10_000,
      });

      const botoesAssinar = page.getByRole('button', { name: /^Assinar/ });
      await expect(botoesAssinar).toHaveCount(2);
    });

    test('exibe o título da página "Escolha seu plano"', async ({ page }) => {
      await setupMocksAndGoto(page, '/planos');

      await expect(
        page.getByRole('heading', { name: 'Escolha seu plano' }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Iniciar checkout ao clicar em Assinar (checkout embutido)', () => {
    test('navega para /checkout/:slug do plano escolhido, sem redirect ao MP', async ({ page }) => {
      await setupMocksAndGoto(page, '/planos');

      await expect(page.getByRole('heading', { name: 'Essencial Semestral' })).toBeVisible({
        timeout: 10_000,
      });

      // Clica em "Assinar Essencial" (ciclo semestral padrão → essencial-semestral)
      await page.getByRole('button', { name: 'Assinar Essencial' }).click();

      // O checkout agora é embutido: a navegação fica dentro da plataforma.
      await expect(page).toHaveURL(/\/checkout\/essencial-semestral/, { timeout: 10_000 });
    });
  });

  test.describe('Página de retorno (/assinatura/retorno)', () => {
    test('pagamento aprovado: exibe "Assinatura ativada" e redireciona ao dashboard', async ({
      page,
    }) => {
      await setupMocksAndGoto(
        page,
        '/assinatura/retorno?status=approved&preapproval_id=fake-pre-123',
        true,
      );

      await expect(
        page.getByRole('heading', { name: /Assinatura ativada/i }),
      ).toBeVisible({ timeout: 10_000 });

      // Após 1,5 s o componente navega para /dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    });

    test('pagamento em processamento (pendente): exibe estado "Confirmando seu pagamento…"', async ({
      page,
    }) => {
      // RPC retorna false → polling não confirma; verificamos o estado inicial
      await setupMocksAndGoto(page, '/assinatura/retorno?status=approved', false);

      await expect(
        page.getByRole('heading', { name: /Confirmando seu pagamento/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('pagamento recusado: exibe "Pagamento não aprovado" e botão "Tentar novamente"', async ({
      page,
    }) => {
      await setupMocksAndGoto(page, '/assinatura/retorno?status=rejected', false);

      await expect(
        page.getByRole('heading', { name: /Pagamento não aprovado/i }),
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        page.getByRole('button', { name: /Tentar novamente/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('pagamento cancelado: também exibe estado de rejeição', async ({ page }) => {
      await setupMocksAndGoto(page, '/assinatura/retorno?status=cancelled', false);

      await expect(
        page.getByRole('heading', { name: /Pagamento não aprovado/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('pagamento falhou: também exibe estado de rejeição', async ({ page }) => {
      await setupMocksAndGoto(page, '/assinatura/retorno?status=failure', false);

      await expect(
        page.getByRole('heading', { name: /Pagamento não aprovado/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('botão "Tentar novamente" no estado rejeitado navega para /planos', async ({ page }) => {
      await setupMocksAndGoto(page, '/assinatura/retorno?status=rejected', false);

      await expect(
        page.getByRole('heading', { name: /Pagamento não aprovado/i }),
      ).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: /Tentar novamente/i }).click();

      await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
    });

    test('sem query params de status: exibe o spinner de processamento inicial', async ({
      page,
    }) => {
      await setupMocksAndGoto(page, '/assinatura/retorno', false);

      await expect(
        page.getByRole('heading', { name: /Confirmando seu pagamento/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
