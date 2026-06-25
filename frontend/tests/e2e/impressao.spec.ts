import { test, expect } from '@playwright/test';
import { SimuladosPage } from './pages/simulados.page';

test.describe('Impressão de simulados', () => {
  let simulados: SimuladosPage;

  test.beforeEach(({ page }) => {
    simulados = new SimuladosPage(page);
  });

  test('abre a tela de impressão a partir do detalhe da prova', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível para imprimir');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const imprimirButton = page.getByRole('button', { name: /Imprimir/i });
    const visivel = await imprimirButton.isVisible().catch(() => false);
    test.skip(!visivel, 'Simulado sem questões ou com tentativa ativa');

    await imprimirButton.click();
    await expect(page).toHaveURL(/\/imprimir\/simulado\//);

    // Documento de impressão renderizado (questões ou erro tratado)
    await page.waitForSelector('app-questao-impressao, app-empty-state', { timeout: 15000 });
  });

  test('a barra de opções some na mídia de impressão', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível para imprimir');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const imprimirButton = page.getByRole('button', { name: /Imprimir/i });
    const visivel = await imprimirButton.isVisible().catch(() => false);
    test.skip(!visivel, 'Simulado sem questões ou com tentativa ativa');

    await imprimirButton.click();
    await page.waitForSelector('app-questao-impressao, app-empty-state', { timeout: 15000 });

    const toolbar = page.locator('.no-print').first();
    const temToolbar = await toolbar.count();
    test.skip(temToolbar === 0, 'Página caiu em estado de erro, sem barra de opções');

    // Na tela: visível. Em mídia de impressão: oculto via @media print.
    await expect(toolbar).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(toolbar).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });

  test('a impressão não preserva offset da sidebar em viewport de iPad landscape', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível para imprimir');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const imprimirButton = page.getByRole('button', { name: /Imprimir/i });
    const visivel = await imprimirButton.isVisible().catch(() => false);
    test.skip(!visivel, 'Simulado sem questões ou com tentativa ativa');

    await imprimirButton.click();
    await page.waitForSelector('app-questao-impressao, app-empty-state', { timeout: 15000 });

    const main = page.locator('.impressao-main');
    const doc = page.locator('.doc-impressao');
    await expect(main).toBeVisible();

    await expect(main).toHaveCSS('margin-left', '224px');
    await page.emulateMedia({ media: 'print' });
    await expect(main).toHaveCSS('margin-left', '0px');
    await expect(doc).toHaveCSS('max-width', 'none');
    await page.emulateMedia({ media: 'screen' });
  });
});
