import { type Page, type Locator } from '@playwright/test';

/** Page object da tela de planos (/planos): toggle mensal/semestral + 2 cards (Essencial | Avançado). */
export class PlanosPage {
  readonly toggleMensal: Locator;
  readonly toggleSemestral: Locator;
  readonly headingEssencial: Locator;
  readonly headingAvancado: Locator;
  readonly badgeRecomendado: Locator;
  readonly ctaEssencial: Locator;
  readonly ctaAvancado: Locator;

  constructor(private readonly page: Page) {
    this.toggleMensal = page.getByRole('radio', { name: 'Mensal' });
    this.toggleSemestral = page.getByRole('radio', { name: /Semestral/ });
    this.headingEssencial = page.getByRole('heading', { name: /^Essencial/ });
    this.headingAvancado = page.getByRole('heading', { name: /^Avançado/ });
    this.badgeRecomendado = page.getByText('Recomendado');
    this.ctaEssencial = page.getByRole('button', { name: 'Assinar Essencial' });
    this.ctaAvancado = page.getByRole('button', { name: 'Assinar Avançado' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/planos');
  }

  async selecionarCiclo(ciclo: 'Mensal' | 'Semestral'): Promise<void> {
    if (ciclo === 'Mensal') {
      await this.toggleMensal.click();
    } else {
      await this.toggleSemestral.click();
    }
  }
}
