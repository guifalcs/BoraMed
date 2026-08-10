import { test, expect } from '@playwright/test';
import { setupTierMocks, setupAndNavigate } from './fixtures/tier.fixture';
import { DashboardNavPage } from './pages/dashboard-nav.page';
import { SimuladosPage } from './pages/simulados.page';
import { PlanosPage } from './pages/planos.page';
import { LandingPricingPage } from './pages/landing-pricing.page';

// E2E do tier essencial (plano barato: só treinos nacionais, sem flashcards/
// materiais). Roda no projeto `mocked` (rede 100% interceptada via page.route,
// autenticação via cookie base64- do @supabase/ssr) — mesmo padrão de
// checkout.spec.ts/pagamento.spec.ts. Ver .claude/skills/e2e-testing/SKILL.md.
//
// Rotas `dashboard/**` (e o catch-all que cobre `/planos`) usam SSR — ver
// comentário de `setupAndNavigate` em fixtures/tier.fixture.ts para o porquê
// de navegarmos client-side (via /dashboard) em vez de `page.goto` direto.

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Tier essencial — gates de acesso no dashboard', () => {
  test('sidebar exibe Materiais e Flashcards BLOQUEADOS, não escondidos', async ({ page }) => {
    const nav = new DashboardNavPage(page);
    await setupTierMocks(page, '/dashboard', { nivel: 'essencial' });

    await expect(nav.simuladosLink).toBeVisible({ timeout: 10_000 });
    // Continuam visíveis (esconder esconderia o motivo para assinar), mas como
    // botão de paywall em vez de link navegável.
    await expect(nav.materiaisBloqueado).toBeVisible();
    await expect(nav.flashcardsBloqueado).toBeVisible();
    await expect(nav.materiaisLink).toHaveCount(0);
    await expect(nav.flashcardsLink).toHaveCount(0);
  });

  test('clicar em Materiais bloqueado abre o paywall com a copy do recurso', async ({ page }) => {
    const nav = new DashboardNavPage(page);
    await setupTierMocks(page, '/dashboard', { nivel: 'essencial' });

    await expect(nav.materiaisBloqueado).toBeVisible({ timeout: 10_000 });
    await nav.materiaisBloqueado.click();

    const dialog = page.getByRole('dialog', { name: 'Materiais de estudo' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText('Incluso no plano Avançado.');
  });

  test('acessar /dashboard/materiais diretamente redireciona para /planos', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/materiais', { nivel: 'essencial' });
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('acessar /dashboard/flashcards diretamente redireciona para /planos', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/flashcards', { nivel: 'essencial' });
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('card "Montar simulado" fica bloqueado com CTA para /planos', async ({ page }) => {
    const simulados = new SimuladosPage(page);
    await setupAndNavigate(page, '/dashboard/simulados', { nivel: 'essencial' });

    await expect(simulados.montarSimuladoUpgradeLabel).toBeVisible({ timeout: 10_000 });
    await expect(simulados.montarSimuladoCard).toContainText('Fazer upgrade');

    await simulados.montarSimuladoCard.click();
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('treino nacional (Rede Afya) continua acessível', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/simulados/rede-afya', { nivel: 'essencial' });
    await expect(page.getByRole('heading', { name: 'Treinos nacionais' })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Tier avançado — acesso completo no dashboard', () => {
  test('sidebar exibe o menu completo (Materiais e Flashcards)', async ({ page }) => {
    const nav = new DashboardNavPage(page);
    await setupTierMocks(page, '/dashboard', { nivel: 'avancado' });

    await expect(nav.materiaisLink).toBeVisible({ timeout: 10_000 });
    await expect(nav.flashcardsLink).toBeVisible();
  });

  test('/dashboard/materiais é acessível', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/materiais', { nivel: 'avancado' });
    await expect(page.getByRole('heading', { name: 'Materiais de Estudo' })).toBeVisible({ timeout: 10_000 });
  });

  test('card "Montar simulado" sem bloqueio', async ({ page }) => {
    const simulados = new SimuladosPage(page);
    await setupAndNavigate(page, '/dashboard/simulados', { nivel: 'avancado' });

    await expect(simulados.montarSimuladoCard).toBeVisible({ timeout: 10_000 });
    await expect(simulados.montarSimuladoUpgradeLabel).toHaveCount(0);
    await expect(simulados.montarSimuladoCard).not.toContainText('Fazer upgrade');

    await simulados.montarSimuladoCard.click();
    await expect(page).toHaveURL(/\/dashboard\/simulados\/montar$/, { timeout: 10_000 });
  });
});

test.describe('Página de planos (/planos)', () => {
  // nivel: 'gratuito' — quem chega em /planos tipicamente ainda não assina.
  // Preços vêm de PLANO_MOCKS e são divididos por `frequency` na exibição:
  // essencial-semestral 8340/6 = R$ 13,90/mês, essencial-mensal = R$ 23,90.
  test('semestral é o ciclo padrão, com preços por mês dos dois tiers', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { nivel: 'gratuito' });

    await expect(planos.toggleSemestral).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(planos.headingEssencial).toContainText('Essencial Semestral');
    await expect(planos.headingAvancado).toContainText('Avançado Semestral');
    await expect(page.getByText('R$ 13,90', { exact: true })).toBeVisible();
    await expect(page.getByText('R$ 49,90', { exact: true })).toBeVisible();
  });

  test('alternar para Mensal troca os preços exibidos', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { nivel: 'gratuito' });

    await expect(planos.toggleMensal).toBeVisible({ timeout: 10_000 });
    await planos.selecionarCiclo('Mensal');

    await expect(planos.headingEssencial).toContainText('Essencial Mensal');
    await expect(planos.headingAvancado).toContainText('Avançado Mensal');
    await expect(page.getByText('R$ 23,90', { exact: true })).toBeVisible();
    await expect(page.getByText('R$ 69,90', { exact: true })).toBeVisible();
  });

  test('card Avançado exibe o badge "Recomendado"', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { nivel: 'gratuito' });

    await expect(planos.badgeRecomendado).toBeVisible({ timeout: 10_000 });
  });

  test('CTA do Essencial semestral navega para /checkout/essencial-semestral', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { nivel: 'gratuito' });

    await expect(planos.ctaEssencial).toBeVisible({ timeout: 10_000 });
    await planos.ctaEssencial.click();

    await expect(page).toHaveURL(/\/checkout\/essencial-semestral/, { timeout: 10_000 });
  });
});

test.describe('Landing — seção de planos (sem autenticação)', () => {
  test('renderiza Grátis + 2 pagos, com toggle e semestral como padrão', async ({ page }) => {
    const pricing = new LandingPricingPage(page);
    await pricing.goto();

    await expect(pricing.toggleSemestral).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(pricing.headingGratis).toBeVisible();
    await expect(pricing.headingEssencial).toBeVisible();
    await expect(pricing.headingAvancado).toBeVisible();
    await expect(pricing.featuredFlag).toBeVisible();
    // O card gratuito fica fora do toggle (não tem ciclo), daí 3 e não 2.
    await expect(pricing.cards).toHaveCount(3);
  });

  test('o card gratuito anuncia o teto e o que fica de fora', async ({ page }) => {
    const pricing = new LandingPricingPage(page);
    await pricing.goto();

    await expect(pricing.headingGratis).toBeVisible({ timeout: 10_000 });
    const cardGratis = pricing.cards.filter({ hasText: 'Grátis' }).first();
    await expect(cardGratis).toContainText('3 simulados');
    await expect(cardGratis).toContainText('Sem cartão de crédito');
  });
});

test.describe('Plano gratuito — teto de tentativas no dashboard', () => {
  test('sidebar mostra Materiais e Flashcards bloqueados', async ({ page }) => {
    const nav = new DashboardNavPage(page);
    await setupTierMocks(page, '/dashboard', { nivel: 'gratuito' });

    await expect(nav.simuladosLink).toBeVisible({ timeout: 10_000 });
    await expect(nav.materiaisBloqueado).toBeVisible();
    await expect(nav.flashcardsBloqueado).toBeVisible();
  });

  test('/dashboard é acessível sem assinatura (não há mais paywall na rota)', async ({ page }) => {
    await setupTierMocks(page, '/dashboard', { nivel: 'gratuito' });

    await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('contador aparece no hub de simulados e muda de tom no último', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/simulados', {
      nivel: 'gratuito',
      tentativasRestantes: 1,
    });

    await expect(page.getByText('Resta 1 simulado grátis')).toBeVisible({ timeout: 10_000 });
  });

  test('esgotado, o contador vira CTA de assinatura', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/simulados', {
      nivel: 'gratuito',
      tentativasRestantes: 0,
    });

    await expect(page.getByText('Seus simulados grátis acabaram')).toBeVisible({ timeout: 10_000 });
  });

  test('/dashboard/materiais redireciona para /planos com a origem no link', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/materiais', { nivel: 'gratuito' });
    await expect(page).toHaveURL(/\/planos\?origem=materiais/, { timeout: 10_000 });
  });
});
