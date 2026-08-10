import { type Page, type Locator } from '@playwright/test';

/**
 * Page object da sidebar do dashboard — usado para checar gating por nível.
 *
 * Desde o free tier, recurso pago não some do menu: vira um <button> com selo
 * PRO que abre o paywall. Por isso existem os pares `*Link` (liberado, é <a>) e
 * `*Bloqueado` (é <button>).
 */
export class DashboardNavPage {
  readonly materiaisLink: Locator;
  readonly flashcardsLink: Locator;
  readonly simuladosLink: Locator;
  readonly inicioLink: Locator;
  readonly materiaisBloqueado: Locator;
  readonly flashcardsBloqueado: Locator;

  constructor(private readonly page: Page) {
    const sidebar = page.locator('.sidebar-nav');
    this.materiaisLink = sidebar.getByRole('link', { name: 'Materiais' });
    this.flashcardsLink = sidebar.getByRole('link', { name: 'Flashcards' });
    this.simuladosLink = sidebar.getByRole('link', { name: 'Simulados' });
    this.inicioLink = sidebar.getByRole('link', { name: 'Início' });
    this.materiaisBloqueado = sidebar.getByRole('button', { name: /^Materiais/ });
    this.flashcardsBloqueado = sidebar.getByRole('button', { name: /^Flashcards/ });
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }
}
