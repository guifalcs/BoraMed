import { expect, test, type Route } from '@playwright/test';
import {
  abrirCompetitivo,
  COMPETITIVO_STATS,
  criarDesafio,
  criarRanking,
} from './fixtures/competitivo-ui.fixture';
import { CompetitivoUiPage } from './pages/competitivo-ui.page';

const responderUrl = '**/rest/v1/rpc/responder_desafio_diario';
const desafioUrl = '**/rest/v1/rpc/get_desafio_diario';
const respostaOk = {
  ja_respondeu: false,
  correta: true,
  xp_ganho: 50,
  novas_conquistas: [],
  stats: { ...COMPETITIVO_STATS, xp_total: 2500, xp_semana_atual: 430 },
  estatistica: { total_responderam: 129, percentual_acerto: 72 },
};
const falhar = (route: Route) =>
  route.fulfill({ status: 503, json: { message: 'Falha simulada' } });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'mocked', 'Rede interceptada.'));

test('permite escolher e trocar antes de confirmar; crédito vem do servidor', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  let envios = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/responder_desafio_diario')) envios++;
  });
  await expect(ui.confirmar).toBeDisabled();
  await ui.escolher('B');
  await ui.escolher('A');
  expect(envios).toBe(0);
  await expect(page.getByText('Explicação', { exact: true })).toHaveCount(0);
  await ui.confirmar.click();
  await expect(ui.desafio.getByText('Resposta correta!', { exact: true })).toBeVisible();
  await expect(ui.desafio.getByText('Explicação', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Seu progresso de estudo' })).toContainText(
    '2.500',
  );
  await expect(ui.alternativa('A')).toBeDisabled();
  await expect(ui.confirmar).toHaveCount(0);
  expect(envios).toBe(1);
});
test('alternativas seguem seleção nativa pelo teclado', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await ui.alternativa('A').focus();
  await ui.alternativa('A').press('Space');
  await expect(ui.alternativa('A')).toBeChecked();
  await ui.alternativa('A').press('ArrowDown');
  await expect(ui.alternativa('B')).toBeChecked();
  await expect(ui.alternativa('B')).toBeFocused();
});
test('envio em andamento bloqueia troca e confirmação duplicada', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  let liberar: (() => void) | undefined;
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let envios = 0;
  await page.route(responderUrl, async (route) => {
    envios++;
    await espera;
    await route.fulfill({ json: respostaOk });
  });
  await ui.escolher('A');
  await ui.confirmar.click();
  await expect(
    page.getByRole('button', { name: 'Registrando resposta…', exact: true }),
  ).toBeDisabled();
  await expect(ui.alternativa('B')).toBeDisabled();
  liberar?.();
  await expect(page.getByText('Sua resposta já está registrada.', { exact: false })).toBeVisible();
  expect(envios).toBe(1);
});
test('falha no envio mantém a alternativa e permite nova tentativa', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await page.route(responderUrl, falhar);
  await ui.escolher('A');
  await ui.confirmar.click();
  await expect(ui.desafio.getByRole('alert')).toContainText('Sua alternativa continua selecionada');
  await expect(ui.alternativa('A')).toBeChecked();
  await expect(ui.confirmar).toBeEnabled();
  await page.unroute(responderUrl, falhar);
  await ui.confirmar.click();
  await expect(ui.desafio.getByText('Resposta correta!', { exact: true })).toBeVisible();
});
test('resposta salva com falha de correção não permite reenviar', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await page.route(desafioUrl, falhar);
  await ui.escolher('A');
  await ui.confirmar.click();
  await expect(page.getByRole('button', { name: 'Atualizar correção', exact: true })).toBeVisible();
  await expect(ui.desafio.getByText('Resposta correta!', { exact: true })).toBeVisible();
  await expect(ui.alternativa('A')).toBeDisabled();
  await expect(ui.confirmar).toHaveCount(0);
  await expect(page.getByText('Explicação', { exact: true })).toHaveCount(0);
  await page.unroute(desafioUrl, falhar);
  await page.getByRole('button', { name: 'Atualizar correção', exact: true }).click();
  await expect(ui.desafio.getByText('Explicação', { exact: true })).toBeVisible();
});
test('resposta prévia em outra aba não inventa alternativa nem gabarito', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await page.route(desafioUrl, falhar);
  await page.route(responderUrl, (route) =>
    route.fulfill({ json: { ...respostaOk, ja_respondeu: true, xp_ganho: 0 } }),
  );
  await ui.escolher('B');
  await ui.confirmar.click();
  await expect(page.getByRole('button', { name: 'Atualizar correção', exact: true })).toBeVisible();
  await expect(ui.alternativa('B')).not.toBeChecked();
  await expect(ui.alternativa('B')).toBeDisabled();
  await expect(ui.desafio.getByText(/Resposta correta!|Resposta incorreta/)).toHaveCount(0);
});
for (const scene of ['answered', 'wrong'] as const) {
  test(`revisita ${scene}: correção por texto e sem novo envio`, async ({ page }) => {
    await abrirCompetitivo(page, scene);
    const ui = new CompetitivoUiPage(page);
    await expect(
      ui.desafio.getByText(scene === 'wrong' ? 'Resposta incorreta' : 'Resposta correta!', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(ui.alternativa(scene === 'wrong' ? 'B' : 'A')).toBeChecked();
    await expect(ui.alternativa('A')).toBeDisabled();
    await expect(ui.desafio.getByText('Explicação', { exact: true })).toBeVisible();
    await expect(ui.desafio.getByText('Volte amanhã para o próximo desafio.')).toBeVisible();
  });
}
test('ranking tem abas com setas, Home e End e mostra posição por período', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await expect(ui.ranking).toContainText('#27');
  await ui.aba('Global').focus();
  await ui.aba('Global').press('ArrowRight');
  await expect(ui.aba('Semana')).toBeFocused();
  await expect(ui.aba('Semana')).toHaveAttribute('aria-selected', 'true');
  await expect(ui.ranking).toContainText('#12');
  await expect(ui.ranking.getByText('1.200 XP', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'ranking-tab-semana');
  await ui.aba('Semana').press('Home');
  await expect(ui.aba('Global')).toBeFocused();
  await ui.aba('Global').press('End');
  await expect(ui.aba('Semana')).toBeFocused();
});
test('falhas de carregamento são distintas dos estados vazios e têm retry', async ({ page }) => {
  await abrirCompetitivo(page, 'error');
  const ui = new CompetitivoUiPage(page);
  await expect(page.getByText('Ranking sem participantes ainda', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Sem desafio disponível hoje', { exact: true })).toHaveCount(0);
  await page.route(desafioUrl, (route) => route.fulfill({ json: criarDesafio() }));
  await ui.desafio.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(ui.confirmar).toBeVisible();
  await page.route('**/rest/v1/rpc/get_ranking_global', (route) =>
    route.fulfill({ json: criarRanking() }),
  );
  await ui.ranking.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(ui.ranking.getByText('Marina Costa', { exact: true })).toBeVisible();
  await ui.aba('Semana').click();
  await expect(
    ui.ranking.getByRole('alert').filter({ hasText: 'ranking da semana' }),
  ).toBeVisible();
});
test('posição e XP podem ser recuperados separadamente', async ({ page }) => {
  await abrirCompetitivo(page, 'error');
  const ui = new CompetitivoUiPage(page);
  await page.route('**/rest/v1/rpc/get_meu_xp', (route) =>
    route.fulfill({ json: COMPETITIVO_STATS }),
  );
  await page
    .getByRole('region', { name: 'Seu progresso de estudo' })
    .getByRole('button', { name: 'Tentar novamente' })
    .click();
  await expect(page.getByRole('region', { name: 'Seu progresso de estudo' })).toContainText(
    '2.450',
  );
  await page.route('**/rest/v1/rpc/get_minha_posicao_ranking', (route) =>
    route.fulfill({
      json: { posicao_global: 27, posicao_semana: 12, total_global: 243, total_semana: 87 },
    }),
  );
  await ui.ranking.getByRole('button', { name: 'Atualizar minha posição' }).click();
  await expect(ui.ranking).toContainText('#27');
});
test('anonimato é explicado e aponta para a configuração no perfil', async ({ page }) => {
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await expect(
    ui.ranking.getByText('Você aparece como Anônimo no ranking.', { exact: false }),
  ).toBeVisible();
  await expect(ui.ranking.getByRole('link', { name: 'Gerenciar no perfil' })).toHaveAttribute(
    'href',
    '/dashboard/perfil',
  );
  await expect(ui.ranking.locator('a[href*="ranking-"]')).toHaveCount(0);
});
test('vazio e um participante mantêm próximos passos e plural correto', async ({ page }) => {
  await abrirCompetitivo(page, 'empty');
  const ui = new CompetitivoUiPage(page);
  await expect(ui.desafio.getByText('Sem desafio disponível hoje', { exact: true })).toBeVisible();
  await expect(ui.ranking.getByRole('link', { name: 'Fazer simulado' })).toBeVisible();
  await abrirCompetitivo(page, 'one');
  await expect(ui.ranking.getByText('de 1 participante', { exact: true })).toBeVisible();
});
test('avatar quebrado usa inicial; nomes extensos continuam completos', async ({ page }) => {
  await abrirCompetitivo(page, 'worst');
  const ui = new CompetitivoUiPage(page);
  await expect(ui.ranking.locator('img')).toHaveCount(0);
  await expect(
    ui.ranking.getByText('Maria Eduarda de Albuquerque Vasconcelos e Silva', { exact: true }),
  ).toBeVisible();
  await expect(ui.ranking.getByText('🧑🏽‍⚕️ João Gonçalves', { exact: true })).toBeVisible();
  await ui.verificarLargura();
});
test('imagem da questão amplia sem selecionar ou responder', async ({ page }) => {
  await abrirCompetitivo(page, 'image');
  const ui = new CompetitivoUiPage(page);
  await ui.desafio.getByRole('button', { name: 'Ampliar imagem da questão' }).click();
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(ui.confirmar).toBeDisabled();
});
for (const width of [320, 390, 1280]) {
  test(`dados extensos e texto a 200% em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await abrirCompetitivo(page, 'worst');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const ui = new CompetitivoUiPage(page);
    await ui.verificarLargura();
    await expect(ui.confirmar).toBeVisible();
  });
}

test('imagem da alternativa amplia sem escolher e continua disponível na correção', async ({
  page,
}) => {
  await abrirCompetitivo(page, 'alternative-image');
  const ui = new CompetitivoUiPage(page);
  const zoom = page.getByRole('button', { name: 'Ampliar imagem da alternativa A', exact: true });
  await zoom.click();
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(ui.alternativa('A')).not.toBeChecked();
  await expect(ui.confirmar).toBeDisabled();
  await ui.escolher('A');
  await ui.confirmar.click();
  await expect(ui.alternativa('A')).toBeDisabled();
  await expect(zoom).toBeEnabled();
  await zoom.click();
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).toBeVisible();
});
test('movimento reduzido mantém seleção imediata e controles de toque', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirCompetitivo(page);
  const ui = new CompetitivoUiPage(page);
  await ui.escolher('A');
  await expect(ui.confirmar).toBeEnabled();
  const duration = await ui
    .alternativa('A')
    .locator('../..')
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('0s');
  for (const control of [ui.confirmar, ui.aba('Global'), ui.aba('Semana')]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

const largurasResponsivas = [
  ...new Set([
    ...Array.from({ length: 72 }, (_, i) => 280 + i * 32),
    320,
    360,
    361,
    375,
    390,
    412,
    480,
    600,
    639,
    640,
    641,
    767,
    768,
    769,
    820,
    912,
    1023,
    1024,
    1025,
    1179,
    1180,
    1181,
    1280,
    1440,
    1920,
    2560,
    3840,
  ]),
].sort((a, b) => a - b);
for (const scenario of ['demo', 'worst'] as const) {
  test(`varredura responsiva de 280 a 3840px — ${scenario}`, async ({ page }) => {
    test.setTimeout(90_000);
    await abrirCompetitivo(page, scenario);
    const ui = new CompetitivoUiPage(page);
    for (const tamanho of [100, 200]) {
      await page.evaluate(
        (valor) => (document.documentElement.style.fontSize = `${valor}%`),
        tamanho,
      );
      for (const width of largurasResponsivas) {
        await test.step(`${width}px, texto ${tamanho}%`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await ui.verificarLargura();
        });
      }
    }
  });
}
test.describe('interação por toque e orientação', () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    test(`resposta e ranking em ${viewport.width}×${viewport.height}, com rotação`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await abrirCompetitivo(page);
      const ui = new CompetitivoUiPage(page);
      await ui.alternativa('A').locator('..').tap();
      await expect(ui.alternativa('A')).toBeChecked();
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await ui.verificarLargura();
      await expect(ui.alternativa('A')).toBeChecked();
      await ui.confirmar.tap();
      await expect(ui.desafio.getByText('Resposta correta!', { exact: true })).toBeVisible();
      await ui.aba('Semana').tap();
      await expect(ui.aba('Semana')).toHaveAttribute('aria-selected', 'true');
      await ui.ranking.getByRole('link', { name: 'Gerenciar no perfil' }).click({ trial: true });
      await ui.verificarLargura();
    });
  }
});

for (const scenario of [
  'empty',
  'error',
  'image',
  'alternative-image',
  'answered',
  'wrong',
  'one',
] as const) {
  test(`estados responsivos em larguras críticas — ${scenario}`, async ({ page }) => {
    await abrirCompetitivo(page, scenario);
    const ui = new CompetitivoUiPage(page);
    for (const tamanho of [100, 200]) {
      await page.evaluate(
        (valor) => (document.documentElement.style.fontSize = `${valor}%`),
        tamanho,
      );
      for (const width of [280, 320, 639, 640, 768, 1024, 1179, 1180, 1280, 1920, 3840]) {
        await test.step(`${width}px, texto ${tamanho}%`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await ui.verificarLargura();
        });
      }
    }
  });
}
