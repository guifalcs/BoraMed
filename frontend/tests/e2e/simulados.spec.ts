import { test, expect } from '@playwright/test';
import { SimuladosPage } from './pages/simulados.page';

test.describe('Simulados — Navegação e Listagem', () => {
  let simulados: SimuladosPage;

  test.beforeEach(async ({ page }) => {
    simulados = new SimuladosPage(page);
  });

  test('exibe a página home de simulados com categorias', async ({ page }) => {
    await simulados.gotoHome();
    await expect(simulados.heading).toBeVisible();
    await expect(simulados.redeAfyaCard).toBeVisible();
    await expect(simulados.outrasFaculdadesCard).toBeVisible();
  });

  test('navega para Rede Afya ao clicar no card', async ({ page }) => {
    await simulados.gotoHome();
    await simulados.clickRedeAfya();
    await expect(page).toHaveURL(/\/dashboard\/simulados\/rede-afya/);
  });

  test('lista simulados na página Rede Afya', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    // Deve ter pelo menos 1 simulado ou exibir empty state
    if (count > 0) {
      await expect(simulados.provaCards.first()).toBeVisible();
    } else {
      await expect(simulados.emptyState).toBeVisible();
    }
  });

  test('skeleton desaparece após carregamento', async ({ page }) => {
    await simulados.gotoRedeAfya();
    // Wait for loading to finish
    await simulados.waitForProvasLoaded();
    await expect(simulados.skeletonItems).toHaveCount(0);
  });
});

test.describe('Simulados — Detalhe e Visualização', () => {
  let simulados: SimuladosPage;

  test.beforeEach(async ({ page }) => {
    simulados = new SimuladosPage(page);
  });

  test('abre detalhe de um simulado ao clicar no card', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível para testar detalhe');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    await expect(simulados.provaTitle).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/simulados\/[a-f0-9-]+/);
  });

  test('exibe informações do simulado no detalhe', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    // Metadados básicos presentes
    await expect(page.getByText(/período/i)).toBeVisible();
    await expect(page.getByText(/Edição/i)).toBeVisible();
    await expect(page.getByText(/questões/i)).toBeVisible();
  });

  test('exibe seletor de modo no detalhe', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    await expect(simulados.modoSelector).toBeVisible();
  });

  test('exibe link "Só quero ver as questões e o gabarito"', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    // Only shows if prova has questions
    const hasQuestions = await page.getByText(/questões/).count() > 0;
    if (hasQuestions) {
      await expect(simulados.visualizarLink).toBeVisible();
    }
  });

  test('navega para visualização ao clicar no link', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const linkVisible = await simulados.visualizarLink.isVisible().catch(() => false);
    test.skip(!linkVisible, 'Simulado não tem questões para visualizar');

    await simulados.visualizarLink.click();
    await expect(page).toHaveURL(/\/visualizar$/);
  });
});

test.describe('Simulados — Tentativa', () => {
  let simulados: SimuladosPage;

  test.beforeEach(async ({ page }) => {
    simulados = new SimuladosPage(page);
  });

  test('inicia tentativa e exibe primeira questão', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const btnVisible = await simulados.iniciarButton.isVisible().catch(() => false);
    test.skip(!btnVisible, 'Simulado sem questões ou tentativa ativa existente');

    await simulados.iniciarProva();
    await simulados.waitForTentativaLoaded();

    await expect(simulados.questaoCard.first()).toBeVisible();
    await expect(page).toHaveURL(/\/tentativa\/[a-f0-9-]+/);
  });

  test('seleciona alternativa e avança para próxima questão', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const btnVisible = await simulados.iniciarButton.isVisible().catch(() => false);
    test.skip(!btnVisible, 'Simulado sem questões ou tentativa ativa existente');

    await simulados.iniciarProva();
    await simulados.waitForTentativaLoaded();

    // Selecionar primeira alternativa
    await simulados.selecionarAlternativa(0);

    // Verificar que tem botão de próxima ou finalizar
    const hasProxima = await simulados.proximaButton.isVisible().catch(() => false);
    const hasFinalizar = await simulados.finalizarButton.isVisible().catch(() => false);

    expect(hasProxima || hasFinalizar).toBe(true);
  });

  test('finaliza tentativa e exibe resultado', async ({ page }) => {
    await simulados.gotoRedeAfya();
    await simulados.waitForProvasLoaded();

    const count = await simulados.provaCards.count();
    test.skip(count === 0, 'Nenhum simulado disponível');

    await simulados.clickFirstProva();
    await simulados.waitForDetalheLoaded();

    const btnVisible = await simulados.iniciarButton.isVisible().catch(() => false);
    test.skip(!btnVisible, 'Simulado sem questões ou tentativa ativa');

    await simulados.iniciarProva();
    await simulados.waitForTentativaLoaded();

    // Responde todas as questões disponíveis clicando na primeira alternativa
    let hasNext = true;
    let iterations = 0;
    const maxIterations = 50; // safety guard

    while (hasNext && iterations < maxIterations) {
      iterations++;
      // Selecionar primeira alternativa
      await simulados.selecionarAlternativa(0);

      // Verificar se tem Próxima ou Finalizar
      const proximaVisible = await simulados.proximaButton.isVisible().catch(() => false);
      const finalizarVisible = await simulados.finalizarButton.isVisible().catch(() => false);

      if (finalizarVisible) {
        await simulados.finalizarTentativa();
        hasNext = false;
      } else if (proximaVisible) {
        await simulados.avancarQuestao();
        await page.waitForTimeout(300); // wait for next question to load
      } else {
        hasNext = false;
      }
    }

    // Deve estar na página de resultado
    await simulados.waitForResultado();
    await expect(page).toHaveURL(/\/resultado$/);
  });
});
