import { expect, test } from '@playwright/test';
import { abrirNotas, type NotasScenario } from '../e2e/fixtures/notas.fixture';

const fase = process.env['SHOT_DIR'] ?? 'depois';
const viewport = process.env['SHOT_VP'] ?? 'mobile';
for (const scenario of [
  'demo',
  'empty',
  'risk',
  'approved',
  'single',
  'worst',
  'unsupported',
  'no-period',
  'error',
] as const satisfies readonly NotasScenario[]) {
  test(`Minhas notas — ${scenario}`, async ({ page }) => {
    await abrirNotas(page, scenario);
    if (!['single', 'unsupported', 'no-period', 'error'].includes(scenario)) {
      await page.getByRole('tab', { name: /SOI II/ }).click();
      await expect(page.getByLabel('Nota em Prova N3, de 0 a 15')).toBeVisible();
    }
    await page.addStyleTag({
      content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `tests/screenshots/out/notas/${fase}/${viewport}/${scenario}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
}
