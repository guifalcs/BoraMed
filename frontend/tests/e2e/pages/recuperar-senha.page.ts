import { Page, Locator } from '@playwright/test';

export class RecuperarSenhaPage {
  readonly emailInput: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput   = page.locator('input[name="email"]');
    this.submitButton = page.getByRole('button', { name: 'Enviar link de recuperação', exact: true });
  }

  async goto() {
    await this.page.goto('/recuperar-senha');
  }
}
