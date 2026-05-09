import { test, expect } from '@playwright/test';
import { CadastroPage } from './pages/cadastro.page';

// Limpa storageState: estas páginas são protegidas por guestGuard
test.use({ storageState: { cookies: [], origins: [] } });

const STRONG_PASSWORD = 'Teste123!';
const EXISTING_EMAIL  = 'teste@boramed.com'; // conta de seed — sempre existe

test.describe('Página de Cadastro', () => {
  let cadastro: CadastroPage;

  test.beforeEach(async ({ page }) => {
    cadastro = new CadastroPage(page);
    await cadastro.goto();
  });

  test('carrega a página com os campos corretos', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Crie sua conta.' })).toBeVisible();
    await expect(cadastro.fullNameInput).toBeVisible();
    await expect(cadastro.emailInput).toBeVisible();
    await expect(cadastro.passwordInput).toBeVisible();
    await expect(cadastro.confirmPasswordInput).toBeVisible();
    await expect(cadastro.submitButton).toBeVisible();
  });

  test('exibe link para login', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Já tenho conta' })).toBeVisible();
  });

  test.describe('Validações de formulário (sem chamada ao servidor)', () => {
    test('exibe erro para nome muito curto', async ({ page }) => {
      await cadastro.fill({
        fullName: 'J',
        email: 'novo@example.com',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      await cadastro.submitButton.click();

      await expect(page.getByText('Nome muito curto')).toBeVisible();
    });

    test('exibe erro para e-mail inválido', async ({ page }) => {
      await cadastro.fill({
        fullName: 'João Silva',
        email: 'invalido',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      await cadastro.submitButton.click();

      await expect(page.getByText('E-mail inválido')).toBeVisible();
    });

    test('exibe erro para senha sem letra maiúscula', async ({ page }) => {
      await cadastro.fill({
        fullName: 'João Silva',
        email: 'novo@example.com',
        password: 'abc1234!',
        confirmPassword: 'abc1234!',
      });
      await cadastro.submitButton.click();

      await expect(page.locator('.ui-field__error').first()).toBeVisible();
    });

    test('exibe erro quando confirmação de senha não confere', async ({ page }) => {
      await cadastro.fill({
        fullName: 'João Silva',
        email: 'novo@example.com',
        password: STRONG_PASSWORD,
        confirmPassword: 'Diferente1!',
      });
      await cadastro.submitButton.click();

      await expect(page.getByText('As senhas não conferem')).toBeVisible();
    });

    test('exibe erro ao submeter com campos vazios', async ({ page }) => {
      await cadastro.submitButton.click();
      await expect(page.locator('.ui-field__error').first()).toBeVisible();
    });
  });

  test.describe('E-mail já cadastrado (EMAIL_IN_USE)', () => {
    test('exibe mensagem de e-mail já cadastrado', async ({ page }) => {
      await cadastro.fill({
        fullName: 'Usuário Teste',
        email: EXISTING_EMAIL,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      await cadastro.submitButton.click();

      await expect(page.getByText('E-mail já cadastrado.')).toBeVisible({ timeout: 10_000 });
    });
  });
});
