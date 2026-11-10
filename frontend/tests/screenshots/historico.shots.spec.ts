import { expect, test } from '@playwright/test';
import { abrirHistorico } from '../e2e/fixtures/historico.fixture';

const fase = process.env['SHOT_DIR'] ?? 'depois';
const viewport = process.env['SHOT_VP'] ?? 'mobile';
for (const scenario of ['demo', 'worst', 'empty', 'one', 'error', 'partial'] as const) {
  test(`histórico — ${scenario}`, async ({ page }) => {
    await abrirHistorico(page, scenario);
    await page.addStyleTag({
      content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
    });
    const chart = page.locator('app-evolucao-nota-chart canvas');
    if (['demo', 'worst', 'one'].includes(scenario)) {
      await page.getByRole('heading', { name: /Evolução de [nN]otas/ }).scrollIntoViewIfNeeded();
      await chart.scrollIntoViewIfNeeded();
      await expect(chart).toBeVisible();
      await page.waitForTimeout(1200);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `tests/screenshots/out/historico/${fase}/${viewport}/${scenario}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    if (fase === 'depois' && scenario === 'demo') {
      await page.locator('app-historico .metrics').screenshot({
        path: `tests/screenshots/out/historico/${fase}/${viewport}/cards.png`,
        animations: 'disabled',
      });
    }
  });
}
