import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlashcardsHomeComponent } from './flashcards-home.component';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { FlashcardDeck } from '../../../core/models/flashcard';

function deckFactory(overrides: Partial<FlashcardDeck> = {}): FlashcardDeck {
  return {
    id: 'deck-1',
    user_id: null,
    oficial: true,
    titulo: 'Deck oficial',
    descricao: null,
    publico: false,
    likes_count: 0,
    cards_count: 10,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('FlashcardsHomeComponent', () => {
  let fixture: ComponentFixture<FlashcardsHomeComponent>;
  let el: HTMLElement;
  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let flashcardServiceMock: {
    listarDecksOficiais: ReturnType<typeof vi.fn>;
    listarMeusDecks: ReturnType<typeof vi.fn>;
    carregarFeed: ReturnType<typeof vi.fn>;
    excluirDeck: ReturnType<typeof vi.fn>;
    toggleLike: ReturnType<typeof vi.fn>;
    feed: ReturnType<typeof signal>;
    feedLoading: ReturnType<typeof signal>;
    feedTemMais: ReturnType<typeof signal>;
    feedOrdenacao: ReturnType<typeof signal>;
  };

  async function setup(aba: string | null): Promise<void> {
    queryParamMap$ = new BehaviorSubject(convertToParamMap(aba ? { aba } : {}));

    flashcardServiceMock = {
      listarDecksOficiais: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      listarMeusDecks: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      carregarFeed: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      excluirDeck: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      toggleLike: vi.fn().mockResolvedValue({ ok: true, data: { curtido: true, likes_count: 1 } }),
      feed: signal([]),
      feedLoading: signal(false),
      feedTemMais: signal(false),
      feedOrdenacao: signal('recentes'),
    };

    await TestBed.configureTestingModule({
      imports: [FlashcardsHomeComponent],
      providers: [
        { provide: FlashcardService, useValue: flashcardServiceMock },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$.asObservable(),
            snapshot: { queryParamMap: queryParamMap$.value },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FlashcardsHomeComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('aba padrão (sem query param)', () => {
    beforeEach(async () => {
      await setup(null);
    });

    it('exibe a aba Oficiais por padrão', () => {
      expect(fixture.componentInstance['abaAtiva']()).toBe('oficiais');
    });

    it('exibe empty-state quando não há decks oficiais', () => {
      expect(el.textContent).toContain('Nenhum deck oficial ainda');
    });
  });

  describe('aba via query param', () => {
    it('exibe a aba Meus decks quando aba=meus', async () => {
      await setup('meus');
      expect(fixture.componentInstance['abaAtiva']()).toBe('meus');
      expect(el.textContent).toContain('Criar deck');
      expect(el.textContent).toContain('Você ainda não criou nenhum deck');
    });

    it('exibe a aba Comunidade quando aba=comunidade', async () => {
      await setup('comunidade');
      expect(fixture.componentInstance['abaAtiva']()).toBe('comunidade');
      expect(el.textContent).toContain('Nenhum deck público ainda');
    });

    it('ignora valores inválidos de aba, caindo no padrão', async () => {
      await setup('inexistente');
      expect(fixture.componentInstance['abaAtiva']()).toBe('oficiais');
    });
  });

  describe('mudança de aba', () => {
    it('navega com queryParams ao trocar de aba', async () => {
      await setup(null);
      const router = TestBed.inject(Router);
      fixture.componentInstance['mudarAba']('comunidade');
      expect(router.navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ queryParams: { aba: 'comunidade' } }),
      );
    });
  });

  describe('feed da comunidade', () => {
    it('renderiza decks do feed do service diretamente (reflete likes otimistas)', async () => {
      await setup('comunidade');
      const feed = TestBed.inject(FlashcardService) as unknown as { feed: ReturnType<typeof signal> };
      feed.feed.set([
        {
          id: 'deck-x',
          titulo: 'Deck da comunidade',
          descricao: null,
          likes_count: 5,
          cards_count: 3,
          criado_em: '2026-01-01T00:00:00Z',
          autor_id: 'user-2',
          autor_nome: 'Fulano',
          curtido_por_mim: false,
        },
      ]);
      fixture.detectChanges();
      expect(el.textContent).toContain('Deck da comunidade');
    });
  });
});
