import { Page, Locator } from '@playwright/test';

export class CadastroPage {
  readonly fullNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly unidadeSelect: Locator;
  readonly periodoSelect: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.fullNameInput        = page.locator('input[name="fullName"]');
    this.emailInput           = page.locator('input[name="email"]');
    this.passwordInput        = page.locator('input[name="password"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    this.unidadeSelect        = page.getByRole('button', { name: 'Unidade Afya' });
    this.periodoSelect        = page.getByRole('button', { name: 'Período' });
    this.submitButton         = page.getByRole('button', { name: 'Criar conta', exact: true });
  }

  async goto() {
    await this.page.goto('/cadastro');
  }

  private async selectOption(trigger: Locator, optionLabel: string) {
    await trigger.click();
    await this.page.getByRole('option', { name: optionLabel, exact: true }).click();
  }

  async fill(data: {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    unidade?: string;
    periodo?: string;
  }) {
    if (data.fullName !== undefined) await this.fullNameInput.fill(data.fullName);
    if (data.email !== undefined) await this.emailInput.fill(data.email);
    if (data.password !== undefined) await this.passwordInput.fill(data.password);
    if (data.confirmPassword !== undefined) await this.confirmPasswordInput.fill(data.confirmPassword);
    if (data.unidade !== undefined) await this.selectOption(this.unidadeSelect, data.unidade);
    if (data.periodo !== undefined) await this.selectOption(this.periodoSelect, data.periodo);
  }
}
