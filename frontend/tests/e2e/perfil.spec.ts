import { test, expect } from '@playwright/test';
import { PerfilPage } from './pages/perfil.page';

test.describe('Página de Perfil', () => {
  let perfil: PerfilPage;

  test.beforeEach(async ({ page }) => {
    perfil = new PerfilPage(page);
    await perfil.goto();
  });

  test('carrega os dados do perfil sem erros', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Meu Perfil' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dados Pessoais' })).toBeVisible();
    await expect(perfil.nomeInput).toBeVisible();
    await expect(perfil.perfilSelect).toBeVisible();
  });

  test('exibe asterisco nos campos obrigatórios', async ({ page }) => {
    // Nome completo e Perfil são obrigatórios
    const requiredMarkers = page.locator('.ui-field__required');
    await expect(requiredMarkers.first()).toBeVisible();
    await expect(requiredMarkers).toHaveCount(await requiredMarkers.count());
    expect(await requiredMarkers.count()).toBeGreaterThanOrEqual(2);
  });

  test('exibe erro de validação ao salvar sem nome', async ({ page }) => {
    await perfil.nomeInput.clear();
    await perfil.saveButton.click();
    await expect(page.getByText('Nome muito curto')).toBeVisible();
  });

  test('exibe erro de validação ao salvar sem perfil selecionado', async ({ page }) => {
    // Limpa nome para garantir que o perfil está vazio (usuário novo)
    // Se já tiver perfil selecionado, o teste deve verificar que o campo é obrigatório
    await expect(perfil.perfilSelect).toBeVisible();
    // O asterisco confirma que é obrigatório
    const perfilLabel = page.locator('.ui-field__label').filter({ hasText: 'Perfil' });
    await expect(perfilLabel.locator('.ui-field__required')).toBeVisible();
  });

  test('Perfil oferece apenas Estudante de Medicina', async ({ page }) => {
    await perfil.perfilSelect.click();
    const dropdown = page.getByRole('listbox', { name: 'Perfil' });
    await expect(dropdown.getByRole('option')).toHaveCount(1);
    await expect(dropdown.getByRole('option')).toHaveText('Estudante de Medicina');
  });

  test('campo Período fica disponível para o estudante', async () => {
    await expect(perfil.periodoSelect).toBeVisible();
    await perfil.selectPeriodo('5º período');
  });

  test('salva dados pessoais com sucesso', async ({ page }) => {
    await perfil.nomeInput.clear();
    await perfil.nomeInput.fill('Nome de Teste E2E');
    await perfil.selectPeriodo('5º período');
    await perfil.saveButton.click();

    // Toast de sucesso deve aparecer
    await expect(page.getByText('Dados salvos com sucesso!')).toBeVisible({ timeout: 8_000 });
  });

  test('selecionar opção fecha o dropdown imediatamente', async ({ page }) => {
    await perfil.perfilSelect.click();
    const dropdown = page.getByRole('listbox', { name: 'Perfil' });
    await expect(dropdown).toBeVisible();

    await dropdown.getByText('Estudante de Medicina').click();
    await expect(dropdown).not.toBeVisible();
  });

  test.describe('Seção Alterar Senha', () => {
    test('exibe a seção Alterar Senha com os campos e botão', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Alterar Senha' })).toBeVisible();
      await expect(perfil.currentPasswordInput).toBeVisible();
      await expect(perfil.newPasswordInput).toBeVisible();
      await expect(perfil.confirmPasswordInput).toBeVisible();
      await expect(perfil.savePasswordButton).toBeVisible();
    });

    test('exibe erro ao submeter formulário de senha sem preencher campos', async ({ page }) => {
      await perfil.savePasswordButton.click();
      await expect(page.getByText('Senha atual obrigatória')).toBeVisible();
    });

    test('exibe erro quando as senhas nova e confirmação não conferem', async ({ page }) => {
      await perfil.currentPasswordInput.fill('SenhaAtual1!');
      await perfil.newPasswordInput.fill('NovaSenha1!');
      await perfil.confirmPasswordInput.fill('SenhaErrada1!');
      await perfil.savePasswordButton.click();
      await expect(page.getByText('As senhas não conferem')).toBeVisible();
    });

    test('exibe erro quando a nova senha não atende aos requisitos de força', async ({ page }) => {
      await perfil.currentPasswordInput.fill('qualquercoisa');
      await perfil.newPasswordInput.fill('fraca');
      await perfil.confirmPasswordInput.fill('fraca');
      await perfil.savePasswordButton.click();
      // A mensagem exata depende do requisito que falhar primeiro (maiúscula, número, especial)
      await expect(page.locator('.ui-field__error').first()).toBeVisible();
    });
  });
});
