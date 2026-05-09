import { test, expect } from '@playwright/test';
import { RecuperarSenhaPage } from './pages/recuperar-senha.page';

// Limpa storageState: estas páginas são protegidas por guestGuard
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Página de Recuperar Senha', () => {
  let recuperar: RecuperarSenhaPage;

  test.beforeEach(async ({ page }) => {
    recuperar = new RecuperarSenhaPage(page);
    await recuperar.goto();
  });

  test('carrega a página com campo de e-mail e botão de envio', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Recuperar senha.' })).toBeVisible();
    await expect(recuperar.emailInput).toBeVisible();
    await expect(recuperar.submitButton).toBeVisible();
  });

  test('exibe link para voltar ao login', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Voltar ao login' })).toBeVisible();
  });

  test.describe('Validação — e-mail inválido não dispara requisição', () => {
    test('não exibe mensagem de sucesso com e-mail inválido', async ({ page }) => {
      await recuperar.emailInput.fill('invalido');
      await recuperar.submitButton.click();

      // Botão permanece disponível; estado de sucesso não aparece
      await expect(page.locator('.success')).not.toBeVisible();
    });

    test('não exibe mensagem de sucesso com campo vazio', async ({ page }) => {
      await recuperar.submitButton.click();
      await expect(page.locator('.success')).not.toBeVisible();
    });
  });

  test.describe('E-mail válido — fluxo de sucesso', () => {
    test('exibe mensagem de sucesso após submeter e-mail válido', async ({ page }) => {
      await recuperar.emailInput.fill('qualquer@example.com');
      await recuperar.submitButton.click();

      // O componente sempre mostra sucesso para não revelar se o e-mail existe
      await expect(
        page.getByText('Se este e-mail estiver cadastrado, você receberá as instruções.'),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('desabilita botão após envio bem-sucedido', async ({ page }) => {
      await recuperar.emailInput.fill('qualquer@example.com');
      await recuperar.submitButton.click();

      await expect(
        page.getByText('Se este e-mail estiver cadastrado, você receberá as instruções.'),
      ).toBeVisible({ timeout: 10_000 });

      await expect(recuperar.submitButton).toBeDisabled();
    });
  });
});
