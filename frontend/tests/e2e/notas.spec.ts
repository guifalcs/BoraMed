import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { clientNavigate } from './fixtures/tier.fixture';

/**
 * Minhas notas (dimensões de nota por período), contra o stack local com o
 * seed (`supabase start` + `db reset`):
 *   aluno-notas-2p@boramed.com → 2º período, sem notas (o teste lança e apaga)
 *   aluno-notas-9p@boramed.com → 9º período (sem regulamento)
 *   teste@boramed.com          → admin
 * Rodar: `npx playwright test notas --project=chromium`.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function entrarComo(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  // /login é prerenderizada: espera a hidratação antes de submeter.
  await page.waitForLoadState('networkidle');
  await new LoginPage(page).login(email, 'Teste123!');
  await page.waitForURL(/dashboard|admin/);
  await page.waitForLoadState('networkidle');
}

async function abrirNotas(page: Page): Promise<void> {
  // Rota protegida: navegação client-side (ver memória de E2E com SSR).
  await clientNavigate(page, '/dashboard/notas');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('Minhas notas', () => {
  test('aluno lança nota, vê a meta recalculada, valida o peso e apaga tudo', async ({ page }) => {
    await entrarComo(page, 'aluno-notas-2p@boramed.com');
    await abrirNotas(page);

    await expect(page.getByRole('heading', { name: 'Minhas notas' })).toBeVisible();
    await expect(page.getByText('Lance suas notas').first()).toBeVisible();
    await expect(page.getByText(/Calculadora independente/)).toBeVisible();

    await page.getByRole('tab', { name: /SOI II/ }).click();
    await expect(page.getByRole('tab', { name: /SOI II/ })).toHaveAttribute('aria-selected', 'true');

    // N1 16/20 → faltam 54 dos 80 restantes = 67,5% → "68%" (arredonda para cima)
    const n1 = page.getByLabel('Nota em Prova N1, de 0 a 20');
    await n1.fill('16');
    await n1.press('Enter');
    const teoria = page.locator('app-notas-dimensao', { hasText: 'Teoria' });
    await expect(teoria.getByText('Precisa de 68% no que falta')).toBeVisible();
    await expect(teoria.getByText('Próxima: TPI, mire em 20,3 de 30')).toBeVisible();

    // Acima do peso não salva.
    const n3 = page.getByLabel('Nota em Prova N3, de 0 a 15');
    await n3.fill('16');
    await n3.press('Enter');
    await expect(teoria.getByText('Máximo 15')).toBeVisible();
    await n3.press('Escape');

    // Persistiu: recarrega a tela e a nota continua lá.
    await clientNavigate(page, '/dashboard');
    await abrirNotas(page);
    await page.getByRole('tab', { name: /SOI II/ }).click();
    await expect(page.getByLabel('Nota em Prova N1, de 0 a 20')).toHaveValue('16');

    // Recomeçar.
    await page.getByRole('button', { name: 'Apagar minhas notas' }).click();
    await page.getByRole('button', { name: 'Apagar notas' }).click();
    await expect(page.getByText('Lance suas notas').first()).toBeVisible();
    await expect(page.getByLabel('Nota em Prova N1, de 0 a 20')).toHaveValue('');
  });

  test('período sem regulamento orienta o aluno', async ({ page }) => {
    await entrarComo(page, 'aluno-notas-9p@boramed.com');
    await abrirNotas(page);
    await expect(page.getByRole('heading', { name: 'O 9º período ainda não chegou' })).toBeVisible();
    await expect(page.getByText(/Por enquanto temos o 1º e 2º período/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mudou de período? Atualize no perfil' })).toBeVisible();
  });

  test('admin vê e abre os regulamentos', async ({ page }) => {
    await entrarComo(page, 'teste@boramed.com');

    await clientNavigate(page, '/admin/notas');
    await expect(page.getByRole('heading', { name: 'Dimensões de nota' })).toBeVisible();
    await expect(page.getByRole('link', { name: '1º período · 2026.2' })).toBeVisible();
    await expect(page.getByRole('link', { name: '2º período · 2026.2' })).toBeVisible();

    await page.getByRole('link', { name: '1º período · 2026.2' }).click();
    await expect(page.getByText('Tudo certo: todas as dimensões somam 100.')).toBeVisible();
    await expect(page.getByRole('button', { name: /PIEPE I/ })).toBeVisible();
  });
});
