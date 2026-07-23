import { expect, type Page } from '@playwright/test';

// ─── Mocks e helpers compartilhados para e2e do tier essencial/avançado ──────
//
// Segue o mesmo padrão de checkout.spec.ts / pagamento.spec.ts: sessão via
// cookie base64- (formato @supabase/ssr), projeto `mocked` (rede 100%
// interceptada via page.route). Ver .claude/skills/e2e-testing/SKILL.md.

export type Tier = 'essencial' | 'avancado' | null;

/**
 * Catálogo de planos espelhando a migration `20260717140000_plano_tier_essencial`:
 * essencial-mensal/essencial-semestral (tier barato, só treinos nacionais) e
 * mensal/semestral renomeados para "Avançado Mensal"/"Avançado Semestral".
 */
export const PLANO_MOCKS = [
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
    id: 'plano-avancado-mensal-1',
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
    id: 'plano-avancado-semestral-1',
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
] as const;

const SUPABASE_COOKIE_NAME = 'sb-127-auth-token';
// Unix timestamp para 2099-01-01T00:00:00Z — bem além de qualquer janela de teste.
const FAR_FUTURE_EXPIRES_AT = 4070908800;

function buildFakeSession(userId: string, email: string) {
  const fakeUser = {
    id: userId,
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Usuário Tier' },
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  };

  const accessToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(JSON.stringify({ sub: userId, email, role: 'authenticated', exp: 9999999999 })) +
    '.fake-signature';

  const fakeSession = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: FAR_FUTURE_EXPIRES_AT,
    refresh_token: 'fake-refresh-token',
    user: fakeUser,
  };

  const cookieValue = `base64-${Buffer.from(JSON.stringify(fakeSession), 'utf8').toString('base64url')}`;

  return { fakeUser, fakeSession, cookieValue };
}

function buildFakeProfile(userId: string, email: string) {
  return {
    id: userId,
    nome_completo: 'Usuário Tier',
    email,
    papel: 'aluno',
    avatar_url: null,
    tipo_usuario: null,
    periodo: null,
    faculdade_rede: null,
    competir_publico: false,
    criado_em: '2024-01-01T00:00:00Z',
    atualizado_em: '2024-01-01T00:00:00Z',
  };
}

export interface TierMockOptions {
  /** Resultado do RPC `assinatura_tier` (o que a UI usa para gating). */
  tier?: Tier;
  /** Resultado do RPC `tem_assinatura_ativa` (paywall geral do /dashboard). Default true. */
  temAcesso?: boolean;
  /** Rotas adicionais registradas por último (maior prioridade). */
  extraRoutes?: (page: Page) => Promise<void>;
  /** Identificador do usuário fake, útil para distinguir entre testes. */
  userId?: string;
}

/**
 * Injeta a sessão (cookie @supabase/ssr) e os mocks de rede padrão do
 * dashboard/planos, depois navega para `targetUrl`.
 */
export async function setupTierMocks(page: Page, targetUrl: string, opts: TierMockOptions = {}): Promise<void> {
  const userId = opts.userId ?? 'user-test-tier';
  const email = `${userId}@boramed.com`;
  const { fakeUser, fakeSession, cookieValue } = buildFakeSession(userId, email);
  const fakeProfile = buildFakeProfile(userId, email);

  await page.context().addCookies([
    {
      name: SUPABASE_COOKIE_NAME,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // Fallback genérico do PostgREST (registrado primeiro = menor prioridade).
  await page.route('**/rest/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/auth/v1/user', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) });
  });
  await page.route('**/auth/v1/token**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) });
  });
  await page.route('**/rest/v1/profiles**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeProfile) });
  });
  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.temAcesso ?? true),
    });
  });
  await page.route('**/rest/v1/rpc/assinatura_tier**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.tier ?? null),
    });
  });
  await page.route('**/rest/v1/plano**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLANO_MOCKS) });
  });
  await page.route('**/rest/v1/assinatura**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
  });
  // Onboarding já concluído — evita o tour guiado (sobreposto por cima da UI)
  // interceptar cliques nos testes que navegam pelo dashboard.
  await page.route('**/rest/v1/user_onboarding_state**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          user_id: userId,
          flow_key: 'dashboard_intro',
          flow_version: 1,
          status: 'completed',
          current_step: 'final',
          started_at: '2024-01-01T00:00:00.000Z',
          completed_at: '2024-01-01T00:05:00.000Z',
          skipped_at: null,
          metadata: {},
        },
      ]),
    });
  });
  await page.route('**/realtime/v1/**', (route) => void route.abort());

  if (opts.extraRoutes) await opts.extraRoutes(page);

  await page.goto(targetUrl);
}

/**
 * Navega client-side (sem reload) via history.pushState + popstate — o Angular
 * Router escuta popstate e reavalia guards inteiramente no browser (usando os
 * mocks de rede já registrados).
 *
 * Necessário porque as rotas `dashboard/**` (e o catch-all que cobre `/planos`)
 * são renderizadas com SSR (`app.routes.server.ts`): o cookie forjado deste
 * fixture não é reconhecido pelo `createServerClient` do lado do servidor (só
 * o cliente no browser o lê de fato), então uma navegação FRIA (`page.goto`)
 * direta a essas rotas sempre esbarra num bounce transitório via `/login`
 * antes do client-side assumir — o que faz a rota final perder o path
 * originalmente pedido. Bootar em `/dashboard` (que sobrevive ao bounce,
 * já que é o alvo padrão do guestGuard) e then navegar client-side evita isso.
 */
export async function clientNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * Boota a SPA em `/dashboard` (sobrevive ao bounce SSR/login descrito acima)
 * e então navega client-side até `targetUrl`, evitando reload. Usar para
 * qualquer rota autenticada além de `/dashboard` em si.
 */
export async function setupAndNavigate(page: Page, targetUrl: string, opts: TierMockOptions = {}): Promise<void> {
  const temAcesso = opts.temAcesso ?? true;
  await setupTierMocks(page, '/dashboard', { ...opts, temAcesso });

  // Com acesso ativo, o bounce assentado em /dashboard mostra a sidebar; sem
  // acesso, o subscriptionGuard client-side já redireciona para /planos.
  if (temAcesso) {
    await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 10_000 });
  } else {
    await expect(page.getByRole('heading', { name: 'Escolha seu plano' })).toBeVisible({ timeout: 10_000 });
  }

  if (targetUrl !== '/dashboard' && targetUrl !== '/planos') {
    await clientNavigate(page, targetUrl);
  } else if (targetUrl === '/planos' && temAcesso) {
    await clientNavigate(page, targetUrl);
  }
}

