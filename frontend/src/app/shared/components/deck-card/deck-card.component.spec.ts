import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckCardComponent } from './deck-card.component';
import type { FeedDeck, FlashcardDeck } from '../../../core/models/flashcard';

function deckFactory(overrides: Partial<FlashcardDeck> = {}): FlashcardDeck {
  return {
    id: 'deck-1',
    user_id: null,
    oficial: true,
    titulo: 'Farmacologia — Antibióticos',
    descricao: 'Principais classes.',
    publico: false,
    likes_count: 3,
    cards_count: 10,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function feedDeckFactory(overrides: Partial<FeedDeck> = {}): FeedDeck {
  return {
    id: 'deck-3',
    titulo: 'Bioquímica do ciclo de Krebs',
    descricao: 'Etapas e enzimas-chave.',
    likes_count: 8,
    cards_count: 15,
    criado_em: '2026-06-01T00:00:00Z',
    autor_id: 'user-2',
    autor_nome: 'Maria Silva',
    curtido_por_mim: false,
    ...overrides,
  };
}

async function createComponent(
  deck: FlashcardDeck | FeedDeck,
  extras: { mostrarAutor?: boolean; mostrarAcoes?: boolean } = {},
): Promise<ComponentFixture<DeckCardComponent>> {
  await TestBed.configureTestingModule({ imports: [DeckCardComponent] }).compileComponents();
  const fixture = TestBed.createComponent(DeckCardComponent);
  fixture.componentRef.setInput('deck', deck);
  if (extras.mostrarAutor !== undefined) fixture.componentRef.setInput('mostrarAutor', extras.mostrarAutor);
  if (extras.mostrarAcoes !== undefined) fixture.componentRef.setInput('mostrarAcoes', extras.mostrarAcoes);
  fixture.detectChanges();
  return fixture;
}

describe('DeckCardComponent', () => {
  it('renderiza o título e a contagem de cards', async () => {
    const fixture = await createComponent(deckFactory({ titulo: 'Deck X', cards_count: 5 }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Deck X');
    expect(el.textContent).toContain('5 cards');
  });

  it('exibe badge Oficial quando oficial=true', async () => {
    const fixture = await createComponent(deckFactory({ oficial: true }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Oficial');
  });

  it('exibe badge Público quando publico=true', async () => {
    const fixture = await createComponent(deckFactory({ oficial: false, publico: true }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Público');
  });

  it('não exibe badges quando não é oficial nem público', async () => {
    const fixture = await createComponent(deckFactory({ oficial: false, publico: false }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Oficial');
    expect(el.textContent).not.toContain('Público');
  });

  it('emite estudar ao clicar no card', async () => {
    const fixture = await createComponent(deckFactory({ id: 'deck-x' }));
    const spy = vi.spyOn(fixture.componentInstance.estudar, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector('[role="button"]')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(spy).toHaveBeenCalledWith('deck-x');
  });

  describe('mostrarAcoes', () => {
    it('exibe botões Editar/Excluir e emite os eventos corretos', async () => {
      const fixture = await createComponent(deckFactory({ id: 'deck-y' }), { mostrarAcoes: true });
      const el = fixture.nativeElement as HTMLElement;
      const botoes = Array.from(el.querySelectorAll('button'));

      const editarSpy = vi.spyOn(fixture.componentInstance.editar, 'emit');
      const excluirSpy = vi.spyOn(fixture.componentInstance.excluir, 'emit');

      const editarBtn = botoes.find((b) => b.textContent?.trim() === 'Editar');
      const excluirBtn = botoes.find((b) => b.textContent?.trim() === 'Excluir');

      editarBtn?.click();
      excluirBtn?.click();

      expect(editarSpy).toHaveBeenCalledWith('deck-y');
      expect(excluirSpy).toHaveBeenCalledWith('deck-y');
    });

    it('não exibe ações quando mostrarAcoes é false', async () => {
      const fixture = await createComponent(deckFactory(), { mostrarAcoes: false });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('Editar');
      expect(el.textContent).not.toContain('Excluir');
    });
  });

  describe('feed da comunidade', () => {
    it('exibe autor e curtidas quando mostrarAutor=true', async () => {
      const fixture = await createComponent(feedDeckFactory({ autor_nome: 'João' }), { mostrarAutor: true });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('João');
    });

    it('emite toggleLike ao clicar no botão de curtir', async () => {
      const fixture = await createComponent(feedDeckFactory({ id: 'deck-feed' }));
      const spy = vi.spyOn(fixture.componentInstance.toggleLike, 'emit');
      const el = fixture.nativeElement as HTMLElement;
      const likeBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('8'));
      likeBtn?.click();
      expect(spy).toHaveBeenCalledWith('deck-feed');
    });
  });

  describe('ver curtidas (dono do deck)', () => {
    it('emite verCurtidas ao clicar quando deck é público', async () => {
      const fixture = await createComponent(deckFactory({ id: 'deck-pub', oficial: false, publico: true }));
      const spy = vi.spyOn(fixture.componentInstance.verCurtidas, 'emit');
      const el = fixture.nativeElement as HTMLElement;
      const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('ver curtidas'));
      btn?.click();
      expect(spy).toHaveBeenCalledWith('deck-pub');
    });

    it('deck não público mostra a contagem sem botões de curtida', async () => {
      const fixture = await createComponent(deckFactory({ oficial: false, publico: false }));
      const el = fixture.nativeElement as HTMLElement;
      const btn = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('3') || b.textContent?.includes('ver curtidas'),
      );
      expect(btn).toBeUndefined();
      expect(el.textContent).toContain('3');
    });

    it('deck próprio público mostra botão de curtir que emite toggleLike', async () => {
      const fixture = await createComponent(
        deckFactory({ id: 'deck-pub', oficial: false, publico: true, curtido_por_mim: false }),
      );
      const spy = vi.spyOn(fixture.componentInstance.toggleLike, 'emit');
      const el = fixture.nativeElement as HTMLElement;
      const likeBtn = el.querySelector<HTMLButtonElement>('button[aria-label="Curtir deck"]');
      expect(likeBtn).not.toBeNull();
      likeBtn!.click();
      expect(spy).toHaveBeenCalledWith('deck-pub');
    });

    it('deck próprio público já curtido mostra o estado de descurtir', async () => {
      const fixture = await createComponent(
        deckFactory({ id: 'deck-pub', oficial: false, publico: true, curtido_por_mim: true }),
      );
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('button[aria-label="Descurtir deck"]')).not.toBeNull();
    });
  });
});
