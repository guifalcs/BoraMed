import { Page, Locator } from '@playwright/test';

export class CadastroPage {
  readonly fullNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.fullNameInput        = page.locator('input[name="fullName"]');
    this.emailInput           = page.locator('input[name="email"]');
    this.passwordInput        = page.locator('input[name="password"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    this.submitButton         = page.getByRole('button', { name: 'Criar conta', exact: true });
  }

  async goto() {
    await this.page.goto('/cadastro');
  }

  async fill(data: {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }) {
    if (data.fullName !== undefined) await this.fullNameInput.fill(data.fullName);
    if (data.email !== undefined) await this.emailInput.fill(data.email);
    if (data.password !== undefined) await this.passwordInput.fill(data.password);
    if (data.confirmPassword !== undefined) await this.confirmPasswordInput.fill(data.confirmPassword);
  }
}
