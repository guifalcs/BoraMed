import { expect, test } from '@playwright/test';
import { abrirNotas } from './fixtures/notas.fixture';
import { clientNavigate } from './fixtures/tier.fixture';
import { NotasPage } from './pages/notas.page';

test.beforeEach(({}, testInfo) =>
  test.skip(
    testInfo.project.name !== 'mocked',
    'Rede interceptada; sem banco ou autenticação reais.',
  ),
);

test('lança decimal, recalcula, persiste ao voltar e apaga com confirmação', async ({ page }) => {
  await abrirNotas(page, 'empty');
  const notas = new NotasPage(page);
  await expect(notas.teoria.getByText('Sem notas', { exact: true })).toBeVisible();
  await notas.lancar(notas.n1, '16,5');
  await expect(notas.n1).toHaveValue('16,5');
  await expect(notas.teoria.getByText('Precisa de 67% no que falta')).toBeVisible();
  await expect(notas.status).toHaveText(/Alterações salvas/);
  await clientNavigate(page, '/dashboard');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await clientNavigate(page, '/dashboard/notas');
  await expect(notas.n1).toHaveValue('16,5');
  await notas.abrirLimpeza();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(notas.n1).toHaveValue('16,5');
  await notas.abrirLimpeza();
  await page.getByRole('button', { name: 'Apagar notas', exact: true }).click();
  await expect(notas.n1).toHaveValue('');
  await expect(notas.teoria.getByText('Sem notas', { exact: true })).toBeVisible();
});

test('valida o peso, associa o erro ao campo e Esc desfaz sem gravar', async ({ page }) => {
  await abrirNotas(page);
  const notas = new NotasPage(page);
  const gravacoes: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/salvar_nota_lancamento')) gravacoes.push(req.postData() ?? '');
  });
  await notas.lancar(notas.n3, '16');
  await expect(notas.n3).toHaveAttribute('aria-invalid', 'true');
  await expect(notas.n3).toHaveAccessibleDescription('Máximo 15');
  await notas.n3.press('Escape');
  await expect(notas.n3).toHaveValue('');
  await expect(notas.n3).toHaveAttribute('aria-invalid', 'false');
  expect(gravacoes).toHaveLength(0);
});

test('salva zero e apaga só uma nota ao deixar o campo vazio', async ({ page }) => {
  await abrirNotas(page);
  const notas = new NotasPage(page);
  await notas.lancar(notas.n1, '0');
  await expect(notas.n1).toHaveValue('0');
  await expect(notas.teoria.getByText('Sem notas', { exact: true })).toBeHidden();
  await notas.lancar(notas.n1, '');
  await expect(notas.teoria.getByText('Sem notas', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Nota em Avaliação Diária na APG · 1ª parcial, de 0 a 20'),
  ).toHaveValue('17,5');
});

test('falha ao gravar restaura a nota e permite tentar novamente', async ({ page }) => {
  await abrirNotas(page);
  const notas = new NotasPage(page);
  await page.route('**/rest/v1/rpc/salvar_nota_lancamento', (route) =>
    route.fulfill({ status: 500, json: { message: 'Não foi possível salvar sua nota.' } }),
  );
  await notas.lancar(notas.n1, '18');
  await expect(page.getByText('Não foi possível salvar sua nota.', { exact: true })).toBeVisible();
  await expect(notas.n1).toHaveValue('16');
  await page.unroute('**/rest/v1/rpc/salvar_nota_lancamento');
  // O handler da fixture foi removido junto com o de falha: reinstala a resposta de sucesso.
  await page.route('**/rest/v1/rpc/salvar_nota_lancamento', (route) =>
    route.fulfill({
      json: { item_id: 'item-0-0-0', nota: 18, atualizado_em: '2026-11-09T15:00:00Z' },
    }),
  );
  await notas.lancar(notas.n1, '18');
  await expect(notas.status).toHaveText(/Alterações salvas/);
  await expect(notas.n1).toHaveValue('18');
});

test('abas têm seleção, painel associado e navegação por teclado', async ({ page }) => {
  await abrirNotas(page);
  const notas = new NotasPage(page);
  const soi = notas.tabs.getByRole('tab', { name: 'SOI II', exact: true });
  await soi.focus();
  await soi.press('ArrowRight');
  const ham = notas.tabs.getByRole('tab', { name: 'HAM II', exact: true });
  await expect(ham).toBeFocused();
  await expect(ham).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Habilidades e Atitudes Médicas II' }),
  ).toBeVisible();
  await ham.press('End');
  const piepe = notas.tabs.getByRole('tab', { name: 'PIEPE II', exact: true });
  await expect(piepe).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    (await piepe.getAttribute('id')) ?? '',
  );
  await piepe.press('Home');
  await expect(soi).toBeFocused();
  await expect(notas.tabs.locator('[tabindex="0"]')).toHaveCount(1);
});

test('aviso de atenção leva o foco até a dimensão', async ({ page }) => {
  await abrirNotas(page, 'risk');
  const notas = new NotasPage(page);
  await notas.selecionarEixo('HAM II');
  await page.getByRole('button', { name: /SOI II · Teoria:/ }).click();
  await expect(notas.teoria).toBeFocused();
  await expect(notas.teoria.getByText('Atenção', { exact: true })).toBeVisible();
});

test('meta de teoria não aprova a prática e regras permanecem acessíveis', async ({ page }) => {
  await abrirNotas(page, 'approved');
  const notas = new NotasPage(page);
  await expect(notas.teoria.getByText('Meta atingida', { exact: true })).toBeVisible();
  await expect(notas.pratica.getByText('Meta atingida', { exact: true })).toBeHidden();
  await page.getByText('Como funciona a aprovação', { exact: true }).click();
  await expect(page.getByText('Frequência mínima de 75%.', { exact: true })).toBeVisible();
});

test('falha de leitura oferece recuperação', async ({ page }) => {
  await abrirNotas(page, 'error');
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas notas', exact: true })).toBeVisible();
});

test('período indisponível orienta a atualizar o perfil', async ({ page }) => {
  await abrirNotas(page, 'unsupported');
  await expect(page.getByRole('heading', { name: 'O 9º período ainda não chegou' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Mudou de período? Atualize no perfil' }),
  ).toBeVisible();
});

test('período ausente permite escolher antes de continuar', async ({ page }) => {
  await abrirNotas(page, 'no-period');
  await expect(page.getByRole('heading', { name: 'Em que período você está?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar e ver minhas notas' })).toBeDisabled();
  await page.getByLabel('Seu período').click();
  await page.getByRole('option', { name: '2º período', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar e ver minhas notas' })).toBeEnabled();
});

test('gravação pendente informa processamento e impede limpeza simultânea', async ({ page }) => {
  await abrirNotas(page);
  const notas = new NotasPage(page);
  let liberar: (() => void) | undefined;
  await page.route('**/rest/v1/rpc/salvar_nota_lancamento', async (route) => {
    await new Promise<void>((resolve) => {
      liberar = resolve;
    });
    await route.fulfill({
      json: { item_id: 'item-0-0-0', nota: 18, atualizado_em: '2026-11-09T15:00:00Z' },
    });
  });
  await notas.lancar(notas.n1, '18');
  await expect(notas.status).toHaveText(/Salvando/);
  await expect(page.getByRole('button', { name: 'Apagar minhas notas' })).toBeDisabled();
  liberar?.();
  await expect(notas.status).toHaveText(/Alterações salvas/);
  await expect(page.getByRole('button', { name: 'Apagar minhas notas' })).toBeEnabled();
});

test('falha ao apagar mantém as notas e permite nova tentativa', async ({ page }) => {
  await abrirNotas(page);
  const notas = new NotasPage(page);
  await page.route('**/rest/v1/rpc/limpar_minhas_notas', (route) =>
    route.fulfill({ status: 500, json: { message: 'Não foi possível apagar suas notas.' } }),
  );
  await notas.abrirLimpeza();
  await page.getByRole('button', { name: 'Apagar notas', exact: true }).click();
  await expect(
    page.getByText('Não foi possível apagar suas notas.', { exact: true }),
  ).toBeVisible();
  await expect(notas.n1).toHaveValue('16');
  await expect(notas.n1).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Apagar minhas notas' })).toBeEnabled();
});

for (const width of [320, 390, 1280]) {
  test(`nomes extensos e campos cabem em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await abrirNotas(page, 'worst');
    const notas = new NotasPage(page);
    await notas.verificarLargura();
    await expect(notas.n3).toBeVisible();
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await notas.verificarLargura();
  });
}

test('dimensão única não reserva uma coluna vazia', async ({ page }) => {
  await abrirNotas(page, 'single');
  await expect(page.getByRole('article', { name: 'Nota única', exact: true })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);
});

test('movimento reduzido conserva a navegação e o foco', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirNotas(page, 'risk');
  const notas = new NotasPage(page);
  await page.getByRole('button', { name: /SOI II · Teoria:/ }).click();
  await expect(notas.teoria).toBeFocused();
});
