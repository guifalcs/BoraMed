import { test, expect } from '@playwright/test';

// Módulo /admin/cupons: CRUD de cupons e fechamento mensal de comissão.
// Depende do seed local de demonstração (supabase/snippets/seed-cupons-comissoes-demo.sql):
// YAS20 (Yasmin, 30% Ipatinga / 40% fora, só planos Avançados) com histórico de
// competências pagas, fechadas e o mês corrente aberto.
test.describe('Admin — cupons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/cupons');
    await expect(page.getByRole('heading', { name: 'Cupons e comissões' })).toBeVisible();
  });

  test('lista cupons com responsável e regra de comissão', async ({ page }) => {
    const linhaYas = page.locator('tr', { hasText: 'YAS20' }).first();
    await expect(linhaYas).toBeVisible({ timeout: 15_000 });
    await expect(linhaYas).toContainText('Yasmin Ribeiro');
    await expect(linhaYas).toContainText('30% Ipatinga · 40% fora');
    await expect(linhaYas).toContainText('Avançado');

    // Cupom sem regra de repasse aparece explicitamente como tal.
    await expect(page.locator('tr', { hasText: 'CALOURO20' }).first()).toContainText('Sem comissão');
  });

  test('cria, desativa e exclui um cupom com regra de comissão', async ({ page }) => {
    const codigo = `E2E${Date.now().toString().slice(-6)}`;

    await page.getByRole('button', { name: 'Novo cupom' }).click();
    await page.getByPlaceholder('EX: YAS20').fill(codigo);
    await page.getByPlaceholder('Campanha da embaixadora X').fill('Cupom criado pelo E2E');
    await page.locator('input[type="number"]').first().fill('15');

    // Responsável sem conta na plataforma: só o nome.
    await page.getByPlaceholder('Ex.: Arthur Barata').fill('Responsável E2E');

    await page.getByText('Pagar comissão por este cupom').click();
    await page.locator('label', { hasText: '% aluno de Ipatinga' }).locator('input').fill('30');
    await page.locator('label', { hasText: '% aluno de fora de Ipatinga' }).locator('input').fill('45');
    // Só Avançado gera comissão neste cupom.
    await page.locator('label', { hasText: 'Essencial' }).locator('input[type="checkbox"]').uncheck();

    await page.getByRole('button', { name: 'Salvar cupom' }).click();

    const linha = page.locator('tr', { hasText: codigo }).first();
    await expect(linha).toBeVisible({ timeout: 15_000 });
    await expect(linha).toContainText('Responsável E2E');
    await expect(linha).toContainText('30% Ipatinga · 45% fora');
    await expect(linha).toContainText('Ativo');

    await linha.getByRole('button', { name: 'Desativar' }).click();
    await expect(page.locator('tr', { hasText: codigo }).first()).toContainText('Inativo', {
      timeout: 15_000,
    });

    // Cupom sem uso é apagado de fato.
    await page.locator('tr', { hasText: codigo }).first()
      .getByRole('button', { name: 'Excluir cupom' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.locator('tr', { hasText: codigo })).toHaveCount(0, { timeout: 15_000 });
  });

  test('restringe o cupom a e-mails específicos e mantém a lista ao reabrir', async ({ page }) => {
    const codigo = `E2R${Date.now().toString().slice(-6)}`;

    await page.getByRole('button', { name: 'Novo cupom' }).click();
    await page.getByPlaceholder('EX: YAS20').fill(codigo);
    await page.locator('input[type="number"]').first().fill('10');

    // A lista só aparece depois de marcar a restrição.
    await expect(page.getByTestId('cupom-dest-emails')).toHaveCount(0);
    await page.getByTestId('cupom-restrito').check();

    // Restrito sem ninguém na lista não salva.
    await expect(page.getByText('Lista vazia')).toBeVisible();
    await page.getByRole('button', { name: 'Salvar cupom' }).click();
    await expect(page.getByText('precisa de ao menos um e-mail ou usuário')).toBeVisible();

    // E-mails colados: normaliza, deduplica e devolve ao campo o que não é e-mail.
    await page.getByTestId('cupom-dest-emails').fill('Ana@Teste.com, ana@teste.com\nbia@teste.com; lixo');
    await page.getByTestId('cupom-dest-adicionar').click();
    await expect(page.getByTestId('cupom-dest-total')).toContainText('(2)');
    await expect(page.getByTestId('cupom-dest-item')).toHaveCount(2);
    await expect(page.getByTestId('cupom-dest-emails')).toHaveValue('lixo');

    await page.getByTestId('cupom-dest-emails').fill('');
    await page.getByRole('button', { name: 'Salvar cupom' }).click();

    const linha = page.locator('tr', { hasText: codigo }).first();
    await expect(linha).toBeVisible({ timeout: 15_000 });
    await expect(linha.getByTestId('cupom-badge-restrito')).toContainText('Restrito · 2');

    // Reabre: a lista persistiu (e em minúsculas).
    await linha.getByRole('button', { name: /editar/i }).click();
    await expect(page.getByTestId('cupom-dest-item')).toHaveCount(2);
    await expect(page.getByTestId('cupom-dest-item').first()).toContainText('ana@teste.com');

    // Remove um destinatário e salva: contador da listagem acompanha.
    await page.getByRole('button', { name: 'Remover ana@teste.com' }).click();
    await page.getByRole('button', { name: 'Salvar cupom' }).click();
    await expect(
      page.locator('tr', { hasText: codigo }).first().getByTestId('cupom-badge-restrito'),
    ).toContainText('Restrito · 1', { timeout: 15_000 });

    // E-mail colado e NÃO adicionado não pode ser descartado ao salvar.
    await page.locator('tr', { hasText: codigo }).first()
      .getByRole('button', { name: /editar/i }).click();
    await page.getByTestId('cupom-dest-emails').fill('pendente@teste.com');
    await page.getByRole('button', { name: 'Salvar cupom' }).click();
    await expect(
      page.locator('tr', { hasText: codigo }).first().getByTestId('cupom-badge-restrito'),
    ).toContainText('Restrito · 2', { timeout: 15_000 });

    // Limpeza.
    await page.locator('tr', { hasText: codigo }).first()
      .getByRole('button', { name: 'Excluir cupom' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.locator('tr', { hasText: codigo })).toHaveCount(0, { timeout: 15_000 });
  });

  test('usa o select do design system, não o nativo do navegador', async ({ page }) => {
    await page.getByRole('button', { name: 'Novo cupom' }).click();
    // Nenhum <select> nativo no formulário: tipo e plano usam app-ui-select.
    await expect(page.locator('select')).toHaveCount(0);
    const trigger = page.locator('.ui-select__trigger').first();
    await trigger.click();
    await expect(page.locator('.ui-select__dropdown')).toBeVisible();
  });
});

test.describe('Admin — comissões por competência', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/cupons');
    await page.getByRole('button', { name: 'Comissões' }).click();
  });

  test('mostra o histórico mensal sem precisar gerar relatório', async ({ page }) => {
    // Carrega sozinha: nenhum botão de "gerar".
    await expect(page.getByRole('button', { name: /gerar relat/i })).toHaveCount(0);

    await expect(page.getByText('A pagar').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Já pago').first()).toBeVisible();

    // Mês corrente aberto e meses antigos já acertados convivem na lista.
    await expect(page.getByText('Em andamento').first()).toBeVisible();
    await expect(page.getByText('Paga').first()).toBeVisible();

    // Filtros são do design system.
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('fecha, marca como paga e reabre uma competência', async ({ page }) => {
    // Setembro (mês corrente) do ARTHUR10 começa aberto.
    const linha = page
      .locator('tr')
      .filter({ hasText: 'ARTHUR10' })
      .filter({ hasText: 'Em andamento' })
      .first();
    await expect(linha).toBeVisible({ timeout: 20_000 });

    await linha.getByRole('button', { name: 'Fechar' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    const fechada = page
      .locator('tr')
      .filter({ hasText: 'ARTHUR10' })
      .filter({ hasText: 'A pagar' })
      .first();
    await expect(fechada).toBeVisible({ timeout: 20_000 });

    await fechada.getByRole('button', { name: 'Marcar pago' }).click();
    await page.getByPlaceholder('Ex.: Pix enviado em 05/09').fill('Pago no teste E2E');
    await page.getByRole('button', { name: 'Confirmar' }).click();

    const paga = page
      .locator('tr')
      .filter({ hasText: 'ARTHUR10' })
      .filter({ hasText: 'Paga' })
      .first();
    await expect(paga).toBeVisible({ timeout: 20_000 });

    // Reabrir devolve a competência ao cálculo ao vivo.
    await paga.getByRole('button', { name: 'Reabrir' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(
      page.locator('tr').filter({ hasText: 'ARTHUR10' }).filter({ hasText: 'Em andamento' }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('abre o detalhe de vendas da competência', async ({ page }) => {
    const linha = page.locator('tr').filter({ hasText: 'YAS20' }).first();
    await expect(linha).toBeVisible({ timeout: 20_000 });
    await linha.getByRole('button', { name: 'Vendas' }).click();

    await expect(page.getByRole('columnheader', { name: 'Aluno' })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('Admin — PDF de prestação de contas', () => {
  test('emite o documento A4 com a estética da prestação de contas', async ({ page }) => {
    // window.print() no headless travaria o teste: neutraliza antes de carregar.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    await page.goto('/admin/cupons');
    await page.getByRole('button', { name: 'Comissões' }).click();

    const linha = page.locator('tr').filter({ hasText: 'YAS20' }).first();
    await expect(linha).toBeVisible({ timeout: 20_000 });

    const [aba] = await Promise.all([
      page.context().waitForEvent('page'),
      linha.getByRole('button', { name: 'PDF' }).click(),
    ]);

    await expect(aba.getByRole('heading', { name: /Prestação de contas · Cupom YAS20/ })).toBeVisible(
      { timeout: 20_000 },
    );
    await expect(aba.getByText('Valor a receber')).toBeVisible();
    await expect(aba.getByText('Yasmin Ribeiro')).toBeVisible();
    // "Valor pago" aparece nas duas tabelas (vendas do repasse e vendas fora dele).
    await expect(aba.getByRole('columnheader', { name: 'Valor pago' }).first()).toBeVisible();
    // O e-mail do assinante nunca sai inteiro no documento.
    await expect(aba.getByText(/@aluno\.com/)).toHaveCount(0);
  });
});
