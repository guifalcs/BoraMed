import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
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
    listarDecksOficiais: ReturnType<typeof vi.fn>;
    carregarFeed: ReturnType<typeof vi.fn>;
    criarDeck: ReturnType<typeof vi.fn>;
    atualizarDeck: ReturnType<typeof vi.fn>;
    excluirDeck: ReturnType<typeof vi.fn>;
    toggleLike: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    flashcardServiceMock = {
      obterDeckComCards: vi.fn().mockResolvedValue({ ok: true, data: deckFactory() }),
      listarDecksOficiais: vi.fn().mockResolvedValue({
        ok: true,
        data: [{ ...deckFactory(), id: 'deck-sugestao', titulo: 'Deck sugerido' }],
      }),
      carregarFeed: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      criarDeck: vi.fn(),
      atualizarDeck: vi.fn(),
      excluirDeck: vi.fn(),
      toggleLike: vi.fn(),
    };

    const paramMap = convertToParamMap({ deckId: 'deck-1' });
    await TestBed.configureTestingModule({
      imports: [DeckExecucaoComponent],
      providers: [
        { provide: FlashcardService, useValue: flashcardServiceMock },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap }, paramMap: of(paramMap) },
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

  it('finaliza antecipadamente e conta os cards não respondidos como brancos', () => {
    const component = fixture.componentInstance;

    // Responde só o primeiro card e finaliza com o segundo em branco.
    component['flip'](true);
    component['responder']('acertou');
    component['finalizar']();
    fixture.detectChanges();

    expect(component['finalizado']()).toBe(true);
    expect(component['cardsNaoRespondidos']().length).toBe(1);
    expect(el.textContent).toContain('1 acertos');
    expect(el.textContent).toContain('1 em branco');
    // Aproveitamento sobre o total de cards (1 de 2), não só os respondidos.
    expect(el.textContent).toContain('50%');
    expect(el.textContent).toContain('Cards em branco:');
  });

  it('exibe os contadores de acertos e erros acumulados durante a sessão', () => {
    const component = fixture.componentInstance;

    const contadorAcertos = (): string =>
      el.querySelector('[aria-label="Acertos na sessão"]')?.textContent?.trim() ?? '';
    const contadorErros = (): string =>
      el.querySelector('[aria-label="Erros na sessão"]')?.textContent?.trim() ?? '';

    expect(contadorAcertos()).toContain('0');
    expect(contadorErros()).toContain('0');

    component['flip'](true);
    component['responder']('acertou');
    fixture.detectChanges();

    expect(contadorAcertos()).toContain('1');
    expect(contadorErros()).toContain('0');
    expect(component['popAcerto']()).toBe(true);
  });

  it('ao finalizar, sugere outros decks (excluindo o deck atual)', async () => {
    const component = fixture.componentInstance;

    component['flip'](true);
    component['responder']('acertou');
    component['flip'](true);
    component['responder']('errou');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(flashcardServiceMock.listarDecksOficiais).toHaveBeenCalled();
    expect(flashcardServiceMock.carregarFeed).toHaveBeenCalledWith('recentes', 0);
    expect(el.textContent).toContain('Continue estudando');
    expect(el.textContent).toContain('Deck sugerido');
    // O deck atual (deck-1) não aparece nas sugestões.
    expect(component['sugestoes']().some((d) => d.id === 'deck-1')).toBe(false);
  });

  it('não usa emoji na tela de conclusão (ícones só da biblioteca)', () => {
    const component = fixture.componentInstance;
    component['flip'](true);
    component['responder']('acertou');
    component['flip'](true);
    component['responder']('errou');
    fixture.detectChanges();

    expect(el.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('exibe o botão de voltar durante a sessão', () => {
    const botoes = Array.from(el.querySelectorAll('button'));
    expect(botoes.some((b) => b.textContent?.includes('Voltar'))).toBe(true);
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
