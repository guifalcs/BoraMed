import { expect, test, type Page } from '@playwright/test';
import { abrirCaderno, type CadernoScenario } from '../e2e/fixtures/caderno-erros.fixture';

const fase = process.env['SHOT_DIR'] ?? 'depois';
const viewport = process.env['SHOT_VP'] ?? 'mobile';
const out = `tests/screenshots/out/caderno-erros/${fase}/${viewport}`;

async function registrar(page: Page, nome: string): Promise<void> {
  await page.addStyleTag({
    content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${nome}.png`, fullPage: true, animations: 'disabled' });
}

test('caderno de erros — lista e refazer', async ({ page }) => {
  await abrirCaderno(page);
  await expect(page.getByRole('heading', { name: 'Caderno de Erros', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Nefrologia/ }).click();
  await expect(page.getByRole('link', { name: 'Refazer', exact: true }).first()).toBeVisible();
  await registrar(page, 'lista');
  await page.getByRole('link', { name: 'Refazer', exact: true }).first().click();
  await expect(page.getByRole('radiogroup')).toBeVisible();
  await registrar(page, 'refazer');
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('button', { name: /Próxima questão/ })).toBeVisible();
  await registrar(page, 'resposta');
});

for (const scenario of [
  'worst',
  'empty',
  'one',
  'error',
] as const satisfies readonly CadernoScenario[]) {
  test(`caderno de erros — ${scenario}`, async ({ page }) => {
    await abrirCaderno(page, scenario);
    await expect(
      page.getByRole('heading', { name: 'Caderno de Erros', exact: true }),
    ).toBeVisible();
    if (scenario === 'error')
      await expect(
        page.getByText('Não foi possível carregar seu caderno de erros', { exact: true }),
      ).toBeVisible();
    else if (scenario === 'empty')
      await expect(
        page.getByText('Seu caderno de erros está limpo!', { exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole('button', { name: /^Nefrologia|^Distúrbios/ }).first(),
      ).toBeVisible();
    await registrar(page, scenario);
  });
}
