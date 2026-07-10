import type { Page, Locator } from '@playwright/test';

/** Page object para o módulo de Flashcards (/dashboard/flashcards). */
export class FlashcardsPage {
  constructor(private readonly page: Page) {}

  /**
   * Navega até /dashboard/flashcards via clique no link da sidebar, a partir
   * de /dashboard. Necessário porque, no projeto `mocked`, um `page.goto()`
   * direto numa rota protegida aninhada sofre um round-trip SSR (o `getUser()`
   * do lado do servidor não é interceptável por `page.route` e falha com o
   * JWT fake), fazendo o guestGuard assentar em `/dashboard` em vez da rota
   * pedida. Entrando por clique, a navegação é 100% client-side (SPA) e os
   * guards rodam no browser, onde os mocks funcionam.
   */
  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
    await this.page.getByRole('link', { name: 'Flashcards' }).click();
  }

  get abaOficiaisBtn(): Locator {
    return this.page.getByRole('button', { name: 'Oficiais' });
  }

  get abaMeusBtn(): Locator {
    return this.page.getByRole('button', { name: 'Meus decks' });
  }

  get abaComunidadeBtn(): Locator {
    return this.page.getByRole('button', { name: 'Comunidade' });
  }

  get deckCards(): Locator {
    return this.page.locator('app-deck-card');
  }

  deckCardByTitulo(titulo: string): Locator {
    return this.page.locator('app-deck-card').filter({ hasText: titulo });
  }

  async irParaAba(aba: 'oficiais' | 'meus' | 'comunidade'): Promise<void> {
    if (aba === 'oficiais') await this.abaOficiaisBtn.click();
    else if (aba === 'meus') await this.abaMeusBtn.click();
    else await this.abaComunidadeBtn.click();
  }

  async estudarDeck(titulo: string): Promise<void> {
    await this.deckCardByTitulo(titulo).click();
  }

  // ─── Execução (estudo) ─────────────────────────────────────────────────

  get flipCard(): Locator {
    return this.page.locator('app-flashcard-flip button.flip-card');
  }

  async virarCard(): Promise<void> {
    await this.flipCard.click();
  }

  get botaoAcertei(): Locator {
    return this.page.getByRole('button', { name: 'Acertei' });
  }

  get botaoErrei(): Locator {
    return this.page.getByRole('button', { name: 'Errei' });
  }

  get progresso(): Locator {
    return this.page.getByText(/^Card \d+ de \d+$/);
  }

  get resumoTitulo(): Locator {
    return this.page.getByRole('heading', { name: 'Sessão concluída!' });
  }

  get resumoTexto(): Locator {
    return this.page.getByText(/aproveitamento/);
  }

  // ─── Comunidade / likes ────────────────────────────────────────────────

  likeButtonByTitulo(titulo: string): Locator {
    return this.deckCardByTitulo(titulo).locator('button[aria-label="Curtir deck"], button[aria-label="Descurtir deck"]');
  }

  async curtirDeck(titulo: string): Promise<void> {
    await this.likeButtonByTitulo(titulo).click();
  }
}
