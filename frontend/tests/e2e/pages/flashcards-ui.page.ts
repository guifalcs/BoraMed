import { expect, type Locator, type Page } from '@playwright/test';

export class FlashcardsUiPage {
  readonly titulo: Locator;
  readonly frente: Locator;
  readonly verso: Locator;
  readonly flip: Locator;
  readonly revelar: Locator;
  readonly acertei: Locator;
  readonly errei: Locator;
  readonly progresso: Locator;
  readonly resultado: Locator;
  readonly dialogo: Locator;

  constructor(readonly page: Page) {
    this.titulo = page.getByLabel('Título', { exact: true });
    this.frente = page.getByLabel('Frente · Pergunta', { exact: true });
    this.verso = page.getByLabel('Verso · Resposta', { exact: true });
    this.flip = page.getByRole('button', { name: /^Virar card para/ });
    this.revelar = page.getByRole('button', { name: 'Mostrar resposta', exact: true });
    this.acertei = page.getByRole('button', { name: 'Acertei', exact: true });
    this.errei = page.getByRole('button', { name: 'Errei', exact: true });
    this.progresso = page.getByRole('progressbar', { name: 'Cards avaliados nesta rodada' });
    this.resultado = page.getByRole('heading', { name: 'Sessão concluída!' });
    this.dialogo = page.getByRole('dialog');
  }

  aba(nome: string): Locator {
    return this.page.getByRole('tab', { name: nome, exact: true });
  }
  botao(nome: string): Locator {
    return this.page.getByRole('button', { name: nome, exact: true });
  }
  deck(titulo: string): Locator {
    return this.page.getByRole('article', { name: titulo, exact: true });
  }
  async estudar(titulo: string): Promise<void> {
    await this.deck(titulo)
      .getByRole('button', { name: /^Estudar deck:/ })
      .click();
  }
  async responder(acerto: boolean): Promise<void> {
    await this.revelar.click();
    await (acerto ? this.acertei : this.errei).click();
  }
  async preencher(titulo: string, frente: string, verso: string): Promise<void> {
    await this.titulo.fill(titulo);
    await this.frente.fill(frente);
    await this.verso.fill(verso);
  }

  async verificarLargura(): Promise<void> {
    const fora = await this.page
      .locator('app-flashcards-home, app-deck-editor, app-deck-execucao')
      .evaluate((root) =>
        [...root.querySelectorAll('button, input, textarea, article, h1, h2')]
          .filter((el) => {
            if (el.closest('[role="tablist"], [aria-hidden="true"]')) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
          })
          .map((el) => `${el.tagName}: ${el.textContent?.trim().slice(0, 60)}`),
      );
    expect(fora).toEqual([]);
  }
}
