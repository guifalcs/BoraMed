import { expect, type Locator, type Page } from '@playwright/test';

export class CompetitivoUiPage {
  readonly desafio: Locator;
  readonly ranking: Locator;
  readonly confirmar: Locator;
  constructor(readonly page: Page) {
    this.desafio = page.getByRole('region', { name: 'Desafio de hoje' });
    this.ranking = page.getByRole('region', { name: 'Ranking de estudo' });
    this.confirmar = page.getByRole('button', { name: 'Confirmar resposta', exact: true });
  }
  alternativa(letra: string): Locator {
    return this.desafio.getByRole('radio', { name: new RegExp(`^${letra}\\.`) });
  }
  async escolher(letra: string): Promise<void> {
    await this.alternativa(letra).locator('..').click();
    await expect(this.alternativa(letra)).toBeChecked();
  }
  aba(nome: string): Locator {
    return this.ranking.getByRole('tab', { name: nome, exact: true });
  }
  async verificarLargura(): Promise<void> {
    const fora = await this.page.locator('app-competir-hub').evaluate((root) =>
      [
        ...root.querySelectorAll(
          'button, a, label, h1, h2, .stat-label, .stat-value, .rank-xp, .rank-person, .alternative-content, .question-content, .panel, .stats-panel',
        ),
      ]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 &&
            (rect.left < -1 ||
              rect.right > window.innerWidth + 1 ||
              el.scrollWidth > el.clientWidth + 2)
          );
        })
        .map(
          (el) =>
            `${el.tagName}: ${el.textContent?.trim().slice(0, 60)} (largura ${el.clientWidth}, conteúdo ${el.scrollWidth}, fonte ${getComputedStyle(el).fontSize})`,
        ),
    );
    expect(fora).toEqual([]);
    expect(
      await this.page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual((this.page.viewportSize()?.width ?? 0) + 1);
  }
}
