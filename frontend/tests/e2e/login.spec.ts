import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

// Limpa storageState: estas páginas são protegidas por guestGuard
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Página de Login', () => {
  let login: LoginPage;

  test.beforeEach(async ({ page }) => {
    login = new LoginPage(page);
    await login.goto();
  });

  test('carrega a página de login com os campos corretos', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta.' })).toBeVisible();
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
  });

  test('exibe link para esqueci a senha', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Esqueci a senha' })).toBeVisible();
  });

  test('exibe link para criar conta', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Criar conta' })).toBeVisible();
  });

  test.describe('Validações de formulário', () => {
    test('exibe erro ao submeter com e-mail inválido', async ({ page }) => {
      await login.emailInput.fill('nao-e-um-email');
      await login.passwordInput.fill('qualquercoisa');
      await login.submitButton.click();

      await expect(page.locator('.ui-field__error').first()).toBeVisible();
    });

    test('exibe erro ao submeter com campos vazios', async ({ page }) => {
      await login.submitButton.click();
      await expect(page.locator('.ui-field__error').first()).toBeVisible();
    });
  });

  test.describe('Credenciais inválidas', () => {
    test('exibe mensagem de erro para credenciais incorretas', async ({ page }) => {
      await login.login('usuario@inexistente.com', 'SenhaErrada1!');

      await expect(
        page.getByText('E-mail ou senha incorretos.'),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Login com sucesso', () => {
    test('redireciona para /dashboard após login válido', async ({ page }) => {
      await login.login('teste@boramed.com', 'Teste123!');

      await expect(page).toHaveURL(/\/(inicio|dashboard)/, { timeout: 10_000 });
    });
  });
});
