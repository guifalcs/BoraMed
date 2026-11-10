import { test, expect } from '@playwright/test';
import { abrirCaderno } from './fixtures/caderno-erros.fixture';
import { clientNavigate } from './fixtures/tier.fixture';
import { CadernoErrosPage } from './pages/caderno-erros.page';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mocked', 'Fluxo com rede interceptada.');
});

for (const width of [390, 1440]) {
  test(`resumo com o tema longo de produção mantém os cards compactos em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await abrirCaderno(page, 'resumo-longo');
    const resumo = page.getByRole('region', { name: 'Resumo do caderno' });
    await expect(resumo).toContainText('574');
    await expect(resumo).toContainText('Imunidade Adaptativa (Celular e Humoral)');
    await page.evaluate(() => document.fonts.ready);
    const alturas = await resumo
      .locator(':scope > *')
      .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
    expect(alturas).toHaveLength(4);
    expect(Math.max(...alturas)).toBeLessThan(180);
    await expect(resumo.locator('[title="Imunidade Adaptativa (Celular e Humoral)"]')).toHaveCount(
      1,
    );
    await resumo.screenshot({
      path: `tests/screenshots/out/caderno-erros/resumo-restaurado-${width}.png`,
      animations: 'disabled',
    });
  });
}

test('revisão revela explicação, atualiza progresso e avança sem revelar o próximo gabarito', async ({
  page,
}) => {
  const caderno = new CadernoErrosPage(page);
  await abrirCaderno(page);
  await caderno.aguardar();
  await caderno.iniciar.click();
  await expect(caderno.progresso).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByText('A avaliação da função renal', { exact: false })).toHaveCount(0);
  await caderno.responder();
  await expect(
    page.getByRole('heading', { name: 'Você acertou! Mais um passo à frente.' }),
  ).toBeVisible();
  await expect(
    page.getByText('A avaliação da função renal e a quantificação da proteinúria orientam', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(caderno.progresso).toHaveAttribute('aria-valuenow', '1');
  await caderno.proxima.click();
  await expect(page).toHaveURL(/refazer\/erro-2$/);
  await expect(page.getByRole('radiogroup', { name: 'Alternativas da questão 2' })).toBeVisible();
  await expect(caderno.progresso).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByText('A avaliação da função renal', { exact: false })).toHaveCount(0);
});

test('erro continua pendente, permite concluir e acesso avulso não inventa uma fila', async ({
  page,
}) => {
  const caderno = new CadernoErrosPage(page);
  await abrirCaderno(page, 'one');
  await caderno.aguardar();
  await caderno.iniciar.click();
  await caderno.responder(false);
  await expect(page.getByText('Esta questão continua pendente.', { exact: false })).toBeVisible();
  await caderno.concluir.click();
  await expect(caderno.iniciar).toBeVisible();
  await clientNavigate(page, '/dashboard/caderno-de-erros/refazer/erro-1');
  await expect(page.getByText('Questão avulsa', { exact: true })).toBeVisible();
  await expect(caderno.progresso).toHaveCount(0);
});

test('status explícito e limpar filtros preserva a lista de dominadas', async ({ page }) => {
  const caderno = new CadernoErrosPage(page);
  await abrirCaderno(page);
  await caderno.aguardar();
  await caderno.dominadas.click();
  await expect(caderno.dominadas).toHaveAttribute('aria-pressed', 'true');
  await expect(caderno.pendentes).toHaveAttribute('aria-pressed', 'false');
  await caderno.busca.fill('termo sem resultado');
  await expect(page.getByText('Nenhuma questão para estes filtros', { exact: true })).toBeVisible();
  await caderno.limpar.first().click();
  await expect(caderno.dominadas).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '2 questões' })).toBeVisible();
  await expect(page.getByText('Após 30 dias sem atividade', { exact: false })).toBeVisible();
});

test('marcar dominada confirma a atualização; falha preserva a questão', async ({ page }) => {
  const caderno = new CadernoErrosPage(page);
  await abrirCaderno(page, 'one');
  await caderno.aguardar();
  await caderno.abrirTema();
  await page.route('**/rest/v1/rpc/marcar_questao_dominada', (route) =>
    route.fulfill({ status: 500, json: { message: 'Falha simulada' } }),
  );
  await page.getByRole('button', { name: 'Marcar como dominada' }).click();
  await expect(
    page.getByText('Não foi possível atualizar a questão. Tente novamente.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Refazer', exact: true })).toBeVisible();
  await page.unroute('**/rest/v1/rpc/marcar_questao_dominada');
  await page.route('**/rest/v1/rpc/get_caderno_erros', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/marcar_questao_dominada', (route) =>
    route.fulfill({ json: null }),
  );
  await page.getByRole('button', { name: 'Marcar como dominada' }).click();
  await expect(page.getByText('Questão marcada como dominada.', { exact: true })).toBeVisible();
  await expect(page.getByText('Seu caderno de erros está limpo!', { exact: true })).toBeVisible();
});

test('simulado impede filtros não suportados e envia quantidade e temas ao servidor', async ({
  page,
}) => {
  const caderno = new CadernoErrosPage(page);
  await abrirCaderno(page);
  await caderno.aguardar();
  await caderno.simulado.click();
  await caderno.busca.fill('Paciente');
  await expect(caderno.gerar).toBeDisabled();
  await expect(page.getByText('Limpe a busca por enunciado para gerar um simulado.')).toBeVisible();
  await caderno.limpar.click();
  await caderno.tipo.click();
  await page.getByRole('option', { name: 'Nacional', exact: true }).click();
  await page.getByRole('option', { name: 'Processual', exact: true }).click();
  await caderno.tipo.click();
  await expect(caderno.gerar).toBeDisabled();
  await expect(
    page.getByText('Selecione apenas um tipo ou todos os tipos para gerar um simulado.'),
  ).toBeVisible();
  await caderno.limpar.click();
  await page.getByRole('button', { name: 'Temas', exact: true }).click();
  await page.getByRole('option', { name: 'Nefrologia', exact: true }).click();
  await page.getByRole('button', { name: 'Temas', exact: true }).click();
  await page
    .getByRole('group')
    .filter({ has: page.getByText('Quantidade de questões', { exact: true }) })
    .getByRole('button', { name: '5', exact: true })
    .click();
  await expect(caderno.gerar).toBeEnabled();
  await page.route('**/rest/v1/rpc/gerar_simulado_personalizado', (route) =>
    route.fulfill({ status: 500, json: { message: 'Falha simulada' } }),
  );
  const pedido = page.waitForRequest('**/rest/v1/rpc/gerar_simulado_personalizado');
  await caderno.gerar.click();
  expect((await pedido).postDataJSON()).toMatchObject({
    p_qtd: 5,
    p_tema_ids: ['tema-nefro'],
    p_apenas_erros: true,
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível gerar' })).toBeVisible();
  await expect(caderno.gerar).toBeEnabled();
});

test('falha ao registrar resposta permite responder novamente', async ({ page }) => {
  const caderno = new CadernoErrosPage(page);
  await abrirCaderno(page);
  await caderno.aguardar();
  await caderno.iniciar.click();
  await page.route('**/rest/v1/rpc/responder_questao_avulsa', (route) =>
    route.fulfill({ status: 500, json: { message: 'Falha simulada' } }),
  );
  await caderno.responder();
  await expect(page.getByRole('alert')).toContainText('Não foi possível registrar sua resposta');
  await expect(caderno.proxima).toHaveCount(0);
  await page.unroute('**/rest/v1/rpc/responder_questao_avulsa');
  await page.route('**/rest/v1/rpc/responder_questao_avulsa', (route) =>
    route.fulfill({
      json: {
        correta: true,
        alternativa_correta_id: 'alt-a',
        explicacao: 'Explicação após tentar novamente.',
      },
    }),
  );
  await caderno.responder();
  await expect(caderno.proxima).toBeVisible();
});

for (const width of [320, 390, 768, 1024, 1280]) {
  test(`textos longos, 1.284 questões e texto ampliado cabem em ${width}px`, async ({ page }) => {
    const caderno = new CadernoErrosPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrirCaderno(page, 'worst');
    await expect(page.getByText('1.284 questões', { exact: true }).first()).toBeVisible();
    await caderno.abrirTema('Distúrbios');
    await caderno.semOverflow();
    const refazer = page.getByRole('link', { name: 'Refazer', exact: true }).first();
    const box = await refazer.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await caderno.semOverflow();
  });
}

test('singular e vazio têm contagem e próximo passo corretos', async ({ page }) => {
  await abrirCaderno(page, 'one');
  await expect(page.getByRole('status').filter({ hasText: /^1 questão$/ })).toBeVisible();
  await page.route('**/rest/v1/rpc/get_caderno_erros', (route) => route.fulfill({ json: [] }));
  const caderno = new CadernoErrosPage(page);
  await caderno.dominadas.click();
  await expect(page.getByRole('button', { name: 'Revisar pendentes' })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar pendentes' }).click();
  await expect(page.getByRole('button', { name: 'Explorar simulados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Começar revisão' })).toBeDisabled();
});
