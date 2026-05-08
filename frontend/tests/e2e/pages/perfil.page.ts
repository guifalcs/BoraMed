import { Page, Locator } from '@playwright/test';

export class PerfilPage {
  readonly saveButton: Locator;
  readonly savePasswordButton: Locator;
  readonly nomeInput: Locator;
  readonly perfilSelect: Locator;
  readonly periodoSelect: Locator;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;

  constructor(private readonly page: Page) {
    this.saveButton              = page.getByRole('button', { name: 'Salvar' }).first();
    this.savePasswordButton      = page.getByRole('button', { name: 'Salvar senha' });
    this.nomeInput               = page.locator('input[name="nome_completo"]');
    this.perfilSelect            = page.locator('[aria-label="Perfil"]');
    this.periodoSelect           = page.locator('[aria-label="Período"]');
    this.currentPasswordInput    = page.locator('input[name="currentPassword"]');
    this.newPasswordInput        = page.locator('input[name="newPassword"]');
    this.confirmPasswordInput    = page.locator('input[name="confirmPassword"]');
  }

  async goto() {
    await this.page.goto('/perfil');
    await this.page.waitForSelector('.perfil-card:not(.perfil-skeleton)', { timeout: 10_000 });
  }

  async selectPerfil(label: string) {
    await this.perfilSelect.click();
    await this.page.getByRole('listbox', { name: 'Perfil' }).getByText(label).click();
  }

  async selectPeriodo(label: string) {
    await this.periodoSelect.click();
    await this.page.getByRole('listbox', { name: 'Período' }).getByText(label).click();
  }
}
