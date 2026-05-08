import { test as setup, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

// Usuário criado pelo supabase/seed.sql no ambiente local
const TEST_EMAIL    = 'teste@boramed.com';
const TEST_PASSWORD = 'Teste123!';

setup('autenticar usuário de teste', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(TEST_EMAIL, TEST_PASSWORD);

  await expect(page).toHaveURL(/\/(inicio|dashboard)/, { timeout: 10_000 });

  await page.context().storageState({ path: 'tests/e2e/fixtures/.auth.json' });
});
