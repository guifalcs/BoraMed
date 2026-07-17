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
  test('sidebar não exibe Materiais nem Flashcards', async ({ page }) => {
    const nav = new DashboardNavPage(page);
    await setupTierMocks(page, '/dashboard', { tier: 'essencial' });

    await expect(nav.simuladosLink).toBeVisible({ timeout: 10_000 });
    await expect(nav.materiaisLink).toHaveCount(0);
    await expect(nav.flashcardsLink).toHaveCount(0);
  });

  test('acessar /dashboard/materiais diretamente redireciona para /planos', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/materiais', { tier: 'essencial' });
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('acessar /dashboard/flashcards diretamente redireciona para /planos', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/flashcards', { tier: 'essencial' });
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('card "Montar simulado" fica bloqueado com CTA para /planos', async ({ page }) => {
    const simulados = new SimuladosPage(page);
    await setupAndNavigate(page, '/dashboard/simulados', { tier: 'essencial' });

    await expect(simulados.montarSimuladoUpgradeLabel).toBeVisible({ timeout: 10_000 });
    await expect(simulados.montarSimuladoCard).toContainText('Fazer upgrade');

    await simulados.montarSimuladoCard.click();
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('treino nacional (Rede Afya) continua acessível', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/simulados/rede-afya', { tier: 'essencial' });
    await expect(page.getByRole('heading', { name: 'Treinos nacionais' })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Tier avançado — acesso completo no dashboard', () => {
  test('sidebar exibe o menu completo (Materiais e Flashcards)', async ({ page }) => {
    const nav = new DashboardNavPage(page);
    await setupTierMocks(page, '/dashboard', { tier: 'avancado' });

    await expect(nav.materiaisLink).toBeVisible({ timeout: 10_000 });
    await expect(nav.flashcardsLink).toBeVisible();
  });

  test('/dashboard/materiais é acessível', async ({ page }) => {
    await setupAndNavigate(page, '/dashboard/materiais', { tier: 'avancado' });
    await expect(page.getByRole('heading', { name: 'Materiais de Estudo' })).toBeVisible({ timeout: 10_000 });
  });

  test('card "Montar simulado" sem bloqueio', async ({ page }) => {
    const simulados = new SimuladosPage(page);
    await setupAndNavigate(page, '/dashboard/simulados', { tier: 'avancado' });

    await expect(simulados.montarSimuladoCard).toBeVisible({ timeout: 10_000 });
    await expect(simulados.montarSimuladoUpgradeLabel).toHaveCount(0);
    await expect(simulados.montarSimuladoCard).not.toContainText('Fazer upgrade');

    await simulados.montarSimuladoCard.click();
    await expect(page).toHaveURL(/\/dashboard\/simulados\/montar$/, { timeout: 10_000 });
  });
});

test.describe('Página de planos (/planos)', () => {
  // temAcesso: false — o usuário que chega em /planos tipicamente ainda não
  // tem uma assinatura ativa (senão o paywall o levaria direto ao dashboard).
  test('semestral é o ciclo padrão, com preços por mês dos dois tiers', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { temAcesso: false });

    await expect(planos.toggleSemestral).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(planos.headingEssencial).toContainText('Essencial Semestral');
    await expect(planos.headingAvancado).toContainText('Avançado Semestral');
    await expect(page.getByText('R$ 19,90', { exact: true })).toBeVisible();
    await expect(page.getByText('R$ 49,90', { exact: true })).toBeVisible();
  });

  test('alternar para Mensal troca os preços exibidos', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { temAcesso: false });

    await expect(planos.toggleMensal).toBeVisible({ timeout: 10_000 });
    await planos.selecionarCiclo('Mensal');

    await expect(planos.headingEssencial).toContainText('Essencial Mensal');
    await expect(planos.headingAvancado).toContainText('Avançado Mensal');
    await expect(page.getByText('R$ 29,90', { exact: true })).toBeVisible();
    await expect(page.getByText('R$ 69,90', { exact: true })).toBeVisible();
  });

  test('card Avançado exibe o badge "Recomendado"', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { temAcesso: false });

    await expect(planos.badgeRecomendado).toBeVisible({ timeout: 10_000 });
  });

  test('CTA do Essencial semestral navega para /checkout/essencial-semestral', async ({ page }) => {
    const planos = new PlanosPage(page);
    await setupAndNavigate(page, '/planos', { temAcesso: false });

    await expect(planos.ctaEssencial).toBeVisible({ timeout: 10_000 });
    await planos.ctaEssencial.click();

    await expect(page).toHaveURL(/\/checkout\/essencial-semestral/, { timeout: 10_000 });
  });
});

test.describe('Landing — seção de planos (sem autenticação)', () => {
  test('renderiza os 2 cards com toggle e semestral como padrão', async ({ page }) => {
    const pricing = new LandingPricingPage(page);
    await pricing.goto();

    await expect(pricing.toggleSemestral).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(pricing.headingEssencial).toBeVisible();
    await expect(pricing.headingAvancado).toBeVisible();
    await expect(pricing.featuredFlag).toBeVisible();
    await expect(pricing.cards).toHaveCount(2);
  });
});
