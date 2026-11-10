import { expect, type Locator, type Page } from '@playwright/test';

export class CadernoErrosPage {
  readonly titulo: Locator;
  readonly iniciar: Locator;
  readonly busca: Locator;
  readonly pendentes: Locator;
  readonly dominadas: Locator;
  readonly limpar: Locator;
  readonly simulado: Locator;
  readonly gerar: Locator;
  readonly tipo: Locator;
  readonly proxima: Locator;
  readonly concluir: Locator;
  readonly progresso: Locator;
  readonly voltar: Locator;

  constructor(readonly page: Page) {
    this.titulo = page.getByRole('heading', { name: 'Caderno de Erros', exact: true });
    this.iniciar = page.getByRole('link', { name: 'Começar revisão' });
    this.busca = page.getByRole('searchbox', { name: 'Buscar questão' });
    this.pendentes = page.getByRole('button', { name: 'Pendentes', exact: true });
    this.dominadas = page.getByRole('button', { name: 'Dominadas', exact: true });
    this.limpar = page.getByRole('button', { name: 'Limpar filtros' });
    this.simulado = page.getByRole('button', { name: 'Prefere treinar em simulado?' });
    this.gerar = page.getByRole('button', { name: 'Gerar simulado', exact: true });
    this.tipo = page.getByRole('button', { name: 'Tipo', exact: true });
    this.proxima = page.getByRole('button', { name: 'Próxima questão', exact: true });
    this.concluir = page.getByRole('button', { name: 'Concluir revisão' });
    this.progresso = page.getByRole('progressbar', { name: 'Progresso da revisão' });
    this.voltar = page.getByRole('button', { name: 'Voltar ao caderno' });
  }

  async aguardar(): Promise<void> {
    await expect(this.titulo).toBeVisible();
    await expect(this.page.getByRole('button', { name: /^Nefrologia/ })).toBeVisible();
  }

  async abrirTema(nome = 'Nefrologia'): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(`^${nome}`) }).click();
  }

  async responder(correta = true): Promise<void> {
    const alternativas = this.page.getByRole('radio');
    await expect(alternativas.first()).toBeVisible();
    await alternativas.nth(correta ? 0 : 1).click();
  }

  async semOverflow(): Promise<void> {
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
    const medidas = await this.page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(medidas.conteudo).toBeLessThanOrEqual(medidas.viewport);
    const cardsCortados = await this.page
      .getByRole('main')
      .getByRole('article')
      .evaluateAll((cards) =>
        cards
          .filter((card) => {
            const rect = card.getBoundingClientRect();
            return (
              rect.left < -1 ||
              rect.right > window.innerWidth + 1 ||
              card.scrollWidth > card.clientWidth + 1
            );
          })
          .map((card) => ({
            texto: card.textContent?.trim().slice(0, 120),
            largura: card.clientWidth,
            conteudo: card.scrollWidth,
          })),
      );
    expect(cardsCortados).toEqual([]);
  }
}
