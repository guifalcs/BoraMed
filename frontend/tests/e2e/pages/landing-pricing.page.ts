import { type Page, type Locator } from '@playwright/test';

/** Page object da seção #planos da landing (marketing, sem autenticação). */
export class LandingPricingPage {
  readonly section: Locator;
  readonly toggleMensal: Locator;
  readonly toggleSemestral: Locator;
  readonly cards: Locator;
  readonly headingGratis: Locator;
  readonly headingEssencial: Locator;
  readonly headingAvancado: Locator;
  readonly featuredFlag: Locator;

  constructor(private readonly page: Page) {
    this.section = page.locator('#planos');
    this.toggleMensal = this.section.getByRole('radio', { name: 'Mensal' });
    this.toggleSemestral = this.section.getByRole('radio', { name: /Semestral/ });
    this.cards = this.section.locator('.pricing-card');
    // `exact` + level 3: o <h2> da seção ("Comece grátis…") também casaria.
    this.headingGratis = this.section.getByRole('heading', { name: 'Grátis', exact: true, level: 3 });
    this.headingEssencial = this.section.getByRole('heading', { name: 'Essencial' });
    this.headingAvancado = this.section.getByRole('heading', { name: 'Avançado' });
    this.featuredFlag = this.section.getByText('Recomendado');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#planos');
  }
}
