import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckExecucaoComponent } from './deck-execucao.component';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { FlashcardDeckComCards } from '../../../core/models/flashcard';

function deckFactory(): FlashcardDeckComCards {
  return {
    id: 'deck-1',
    user_id: null,
    oficial: true,
    titulo: 'Deck de teste',
    descricao: null,
    publico: false,
    likes_count: 0,
    cards_count: 2,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    cards: [
      {
        id: 'card-1',
        deck_id: 'deck-1',
        posicao: 0,
        frente: 'Pergunta 1',
        verso: 'Resposta 1',
        frente_imagem_url: null,
        verso_imagem_url: null,
        criado_em: '2026-01-01T00:00:00Z',
        atualizado_em: '2026-01-01T00:00:00Z',
      },
      {
        id: 'card-2',
        deck_id: 'deck-1',
        posicao: 1,
        frente: 'Pergunta 2',
        verso: 'Resposta 2',
        frente_imagem_url: null,
        verso_imagem_url: null,
        criado_em: '2026-01-01T00:00:00Z',
        atualizado_em: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

describe('DeckExecucaoComponent', () => {
  let fixture: ComponentFixture<DeckExecucaoComponent>;
  let el: HTMLElement;
  let flashcardServiceMock: {
    obterDeckComCards: ReturnType<typeof vi.fn>;
    criarDeck: ReturnType<typeof vi.fn>;
    atualizarDeck: ReturnType<typeof vi.fn>;
    excluirDeck: ReturnType<typeof vi.fn>;
    toggleLike: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    flashcardServiceMock = {
      obterDeckComCards: vi.fn().mockResolvedValue({ ok: true, data: deckFactory() }),
      criarDeck: vi.fn(),
      atualizarDeck: vi.fn(),
      excluirDeck: vi.fn(),
      toggleLike: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DeckExecucaoComponent],
      providers: [
        { provide: FlashcardService, useValue: flashcardServiceMock },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ deckId: 'deck-1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeckExecucaoComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('carrega o deck e exibe o progresso do primeiro card', () => {
    expect(el.textContent).toContain('Card 1 de 2');
    expect(el.textContent).toContain('Pergunta 1');
  });

  it('não exibe botões de resposta antes do flip', () => {
    expect(el.textContent).not.toContain('Acertei');
    expect(el.textContent).not.toContain('Errei');
  });

  it('revela os botões Acertei/Errei após o flip', () => {
    fixture.componentInstance['flip'](true);
    fixture.detectChanges();
    expect(el.textContent).toContain('Acertei');
    expect(el.textContent).toContain('Errei');
  });

  it('avança para o próximo card e contabiliza acerto/erro, mostrando o resumo ao final', () => {
    const component = fixture.componentInstance;

    component['flip'](true);
    component['responder']('acertou');
    fixture.detectChanges();
    expect(component['indiceAtual']()).toBe(1);
    expect(component['progresso']()).toBe('Card 2 de 2');

    component['flip'](true);
    component['responder']('errou');
    fixture.detectChanges();

    expect(component['finalizado']()).toBe(true);
    expect(el.textContent).toContain('Sessão concluída');
    expect(el.textContent).toContain('1 acertos');
    expect(el.textContent).toContain('1 erros');
    expect(el.textContent).toContain('50%');
    expect(el.textContent).toContain('Pergunta 2');
  });

  it('nunca chama métodos de escrita do FlashcardService durante a sessão', () => {
    const component = fixture.componentInstance;

    component['flip'](true);
    component['responder']('acertou');
    fixture.detectChanges();
    component['flip'](true);
    component['responder']('errou');
    fixture.detectChanges();
    component['refazer']();
    component['refazerErrados']();
    component['embaralhar']();

    expect(flashcardServiceMock.criarDeck).not.toHaveBeenCalled();
    expect(flashcardServiceMock.atualizarDeck).not.toHaveBeenCalled();
    expect(flashcardServiceMock.excluirDeck).not.toHaveBeenCalled();
    expect(flashcardServiceMock.toggleLike).not.toHaveBeenCalled();
  });
});
