import { type Page, type Locator } from '@playwright/test';

/** Page object da sidebar do dashboard — usado para checar gating por tier. */
export class DashboardNavPage {
  readonly materiaisLink: Locator;
  readonly flashcardsLink: Locator;
  readonly simuladosLink: Locator;
  readonly inicioLink: Locator;

  constructor(private readonly page: Page) {
    const sidebar = page.locator('.sidebar-nav');
    this.materiaisLink = sidebar.getByRole('link', { name: 'Materiais' });
    this.flashcardsLink = sidebar.getByRole('link', { name: 'Flashcards' });
    this.simuladosLink = sidebar.getByRole('link', { name: 'Simulados' });
    this.inicioLink = sidebar.getByRole('link', { name: 'Início' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }
}
