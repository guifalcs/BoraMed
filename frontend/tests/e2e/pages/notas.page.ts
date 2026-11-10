import { expect, type Locator, type Page } from '@playwright/test';

export class NotasPage {
  readonly teoria: Locator;
  readonly pratica: Locator;
  readonly n1: Locator;
  readonly n3: Locator;
  readonly tabs: Locator;
  readonly status: Locator;

  constructor(readonly page: Page) {
    this.teoria = page.getByRole('article', { name: 'Teoria', exact: true });
    this.pratica = page.getByRole('article', { name: 'Prática', exact: true });
    this.n1 = page.getByLabel('Nota em Prova N1, de 0 a 20');
    this.n3 = page.getByLabel('Nota em Prova N3, de 0 a 15');
    this.tabs = page.getByRole('tablist', { name: 'Eixos do período' });
    this.status = page.getByRole('status').filter({ hasText: /Salvando|salvas|Salva ao/ });
  }

  async selecionarEixo(sigla: string): Promise<void> {
    await this.tabs.getByRole('tab', { name: sigla, exact: true }).click();
  }

  async lancar(campo: Locator, valor: string): Promise<void> {
    await campo.fill(valor);
    await campo.press('Enter');
  }

  async abrirLimpeza(): Promise<void> {
    await this.page.getByRole('button', { name: 'Apagar minhas notas', exact: true }).click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  async verificarLargura(): Promise<void> {
    const fora = await this.page.locator('app-minhas-notas').evaluate((root) => {
      const container = root.getBoundingClientRect();
      return [...root.querySelectorAll('input, article, h1, h2, footer, [role="tabpanel"]')]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 && (rect.left < container.left - 1 || rect.right > container.right + 1)
          );
        })
        .map((el) => el.tagName + ': ' + el.textContent?.trim().slice(0, 70));
    });
    expect(fora).toEqual([]);
  }
}
