import { expect, test } from '@playwright/test';
import { abrirHistorico } from './fixtures/historico.fixture';
import { clientNavigate } from './fixtures/tier.fixture';
import { RESULTADO } from '../screenshots/mocks';

test('abre o resultado e volta ao histórico', async ({ page }) => {
  await abrirHistorico(page);
  await page.route('**/rest/v1/rpc/finalizar_tentativa', (route) =>
    route.fulfill({
      json: {
        ...RESULTADO,
        tentativa: { ...RESULTADO.tentativa, id: 'hist-1', prova_id: 'prova-hist-1' },
      },
    }),
  );
  await page.route('**/rest/v1/prova?*', (route) =>
    route.fulfill({
      json: {
        id: 'prova-hist-1',
        nome: 'Treino nacional · Clínica médica',
        tipo: 'autoral',
        origem: 'autoral',
        formato: 'nacional',
        qtd_questoes: 25,
      },
    }),
  );
  await page.locator('.attempt-link').first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/hist-1\/resultado$/);
  await expect(page.getByRole('link', { name: '← Histórico', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '← Histórico', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/historico$/);
  await expect(page.locator('.attempt-row')).toHaveCount(6);
});

test.beforeEach(({}, info) => test.skip(info.project.name !== 'mocked', 'Rede simulada.'));

test('filtra tentativas sem alterar os indicadores acumulados', async ({ page }) => {
  await abrirHistorico(page);
  await expect(page.locator('.attempt-row')).toHaveCount(6);
  await page.getByLabel('Tipo de simulado').selectOption('processual');
  await expect(page.locator('.attempt-row')).toHaveCount(2);
  await expect(page.locator('.metric').first()).toContainText('68%');
  await expect(page.locator('.themes-panel')).toContainText('Todo o período');
  await page.getByRole('combobox', { name: 'Período', exact: true }).selectOption('semana');
  await expect(page.getByText('Nenhum resultado para estes filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).first().click();
  await page.getByRole('searchbox', { name: 'Buscar simulado' }).fill('cardiologia');
  await expect(page.locator('.attempt-row')).toHaveCount(1);
  await expect(page.getByRole('status').first()).toContainText('1 tentativa encontrada');
});

test('ordena, pagina e reinicia a página ao pesquisar', async ({ page }) => {
  await abrirHistorico(page, 'worst');
  await expect(page.locator('.attempt-row')).toHaveCount(10);
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page.locator('.pagination')).toContainText('11–20 de 50');
  await page.getByRole('searchbox').fill('Cardiologia');
  await expect(page.locator('.pagination')).toContainText('1–9 de 9');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByLabel('Ordenar tentativas').selectOption('menor-nota');
  await expect(page.locator('.attempt-row .score').first()).toHaveText('0%');
  await page.getByLabel('Ordenar tentativas').selectOption('maior-nota');
  await expect(page.locator('.attempt-row .score').first()).toHaveText('100%');
});

test('favorita, mantém a escolha ao voltar e reverte uma falha', async ({ page }) => {
  await abrirHistorico(page);
  const favorito = page.getByRole('button', {
    name: 'Adicionar aos favoritos: Revisão de Cardiologia',
    exact: true,
  });
  await Promise.all([
    page.waitForResponse('**/rest/v1/rpc/toggle_favorito_tentativa'),
    favorito.click(),
  ]);
  await expect(
    page.getByRole('button', {
      name: 'Remover dos favoritos: Revisão de Cardiologia',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', {
      name: 'Remover dos favoritos: Revisão de Cardiologia',
      exact: true,
    }),
  ).toBeEnabled();
  await page.route('**/rest/v1/rpc/toggle_favorito_tentativa', (route) =>
    route.fulfill({ status: 500, json: { message: 'Falha simulada' } }),
  );
  await page
    .getByRole('button', { name: 'Remover dos favoritos: Revisão de Cardiologia', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Não foi possível salvar o favorito. Tente novamente.',
  );
  await expect(
    page.getByRole('button', {
      name: 'Remover dos favoritos: Revisão de Cardiologia',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Favoritas', exact: true }).click();
  await expect(page.locator('.attempt-row')).toHaveCount(2);
  await clientNavigate(page, '/dashboard');
  await page.locator('app-historico').waitFor({ state: 'detached' });
  await clientNavigate(page, '/dashboard/historico');
  await expect(
    page.getByRole('button', {
      name: 'Remover dos favoritos: Revisão de Cardiologia',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('preserva a navegação de resultado e a recomendação de treino', async ({ page }) => {
  await abrirHistorico(page, 'worst');
  await expect(page.getByRole('link', { name: 'Treinar tema' })).toHaveAttribute(
    'href',
    /tema=.*qtd=10&modo=estudo/,
  );
  await expect(page.locator('.attempt-link').first()).toHaveAttribute(
    'href',
    '/dashboard/simulados/prova-hist-1/tentativa/hist-1/resultado',
  );
  await page.getByRole('searchbox').fill('Laboratório removido');
  await expect(
    page.locator('.attempt-link').filter({ hasText: 'resultado preservado' }),
  ).toHaveAttribute('href', '/dashboard/simulados/removida/tentativa/hist-3/resultado');
  await page.getByRole('searchbox').fill('Cardiologia');
  await expect(page.locator('.score').filter({ hasText: 'Sem nota' })).toHaveCount(1);
});

test('distingue primeiro uso, erro e falha parcial', async ({ page }) => {
  await abrirHistorico(page, 'empty');
  await expect(page.getByText('Seu histórico começa no primeiro simulado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher um simulado' })).toHaveCount(1);
  await expect(page.locator('.attempts-section')).toHaveCount(0);
});

test('falha parcial preserva indicadores e permite tentar novamente', async ({ page }) => {
  const { recuperarTentativas } = await abrirHistorico(page, 'partial');
  await expect(
    page.getByText('Não foi possível carregar seu histórico', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.metric').first()).toContainText('68%');
  await expect(page.getByText('Seu histórico começa no primeiro simulado')).toHaveCount(0);
  recuperarTentativas();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.attempt-row')).toHaveCount(6);
  await expect(
    page.getByText('Não foi possível carregar seu histórico', { exact: true }),
  ).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`textos longos e ações cabem em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await abrirHistorico(page, 'worst');
    await page.addStyleTag({ content: 'html { font-size: 20px; }' });
    const overflow = await page.locator('app-historico').evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return Array.from(
        el.querySelectorAll<HTMLElement>('a,button,input,select,h3,.score,.metric-context'),
      )
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return (
            rect.width > 0 &&
            (rect.left < bounds.left - 1 ||
              rect.right > bounds.right + 1 ||
              item.scrollWidth > item.clientWidth + 1)
          );
        })
        .map((item) => item.className);
    });
    expect(overflow).toEqual([]);
    expect(
      await page
        .locator('.favorite-button')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  });
}
