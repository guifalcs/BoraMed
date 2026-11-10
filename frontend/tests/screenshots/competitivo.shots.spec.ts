import { test, expect } from '@playwright/test';
import { abrirCompetitivo } from '../e2e/fixtures/competitivo-ui.fixture';

const fase = process.env['SHOT_DIR'] ?? 'depois';
const viewport = process.env['SHOT_VP'] ?? 'mobile';
for (const scene of [
  'demo',
  'answered',
  'wrong',
  'empty',
  'one',
  'worst',
  'error',
  'image',
] as const) {
  test(`competitivo — ${scene}`, async ({ page }) => {
    await abrirCompetitivo(page, scene);
    if (scene === 'image') {
      await page
        .locator('app-competir-hub figure img')
        .evaluate((img) => (img as HTMLImageElement).decode());
    }
    await page.addStyleTag({
      content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `tests/screenshots/out/competitivo/${fase}/${viewport}/${scene}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    if (scene === 'demo') {
      await page.locator('app-competir-hub .alternatives').screenshot({
        path: `tests/screenshots/out/competitivo/${fase}/${viewport}/alternativas.png`,
        animations: 'disabled',
      });
      await page.getByRole('region', { name: 'Seu progresso de estudo' }).screenshot({
        path: `tests/screenshots/out/competitivo/${fase}/${viewport}/resumo.png`,
        animations: 'disabled',
      });
      await page
        .getByRole(fase === 'antes' ? 'button' : 'tab', { name: 'Semana', exact: true })
        .click();
      await expect(page.getByText('1.200 XP', { exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `tests/screenshots/out/competitivo/${fase}/${viewport}/semana.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
}
