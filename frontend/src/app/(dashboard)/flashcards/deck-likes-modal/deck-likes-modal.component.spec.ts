import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckLikesModalComponent } from './deck-likes-modal.component';
import { FlashcardService } from '../../../core/services/flashcard.service';
import type { DeckLikeUsuario } from '../../../core/models/flashcard';

function likeFactory(userId: string, nome: string): DeckLikeUsuario {
  return { user_id: userId, nome, avatar_url: null, criado_em: '2026-01-01T00:00:00Z' };
}

describe('DeckLikesModalComponent', () => {
  let fixture: ComponentFixture<DeckLikesModalComponent>;
  let el: HTMLElement;
  let flashcardServiceMock: { listarLikesDeck: ReturnType<typeof vi.fn> };

  async function setup(likes: DeckLikeUsuario[]): Promise<void> {
    flashcardServiceMock = {
      listarLikesDeck: vi.fn().mockResolvedValue({ ok: true, data: likes }),
    };

    await TestBed.configureTestingModule({
      imports: [DeckLikesModalComponent],
      providers: [{ provide: FlashcardService, useValue: flashcardServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(DeckLikesModalComponent);
    fixture.componentRef.setInput('deckId', 'deck-1');
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup([likeFactory('user-1', 'Ana'), likeFactory('user-2', 'Bruno')]);
  });

  // Regressão: a carga inicial no construtor lia o input required antes de ele
  // existir (NG0950) e o modal ficava preso em "Carregando…".
  it('carrega e lista quem curtiu, saindo do estado de loading', () => {
    expect(flashcardServiceMock.listarLikesDeck).toHaveBeenCalledWith('deck-1', 20, 0);
    expect(el.textContent).not.toContain('Carregando…');
    expect(el.textContent).toContain('Ana');
    expect(el.textContent).toContain('Bruno');
  });

  it('mostra mensagem de lista vazia', async () => {
    TestBed.resetTestingModule();
    await setup([]);
    expect(el.textContent).toContain('Ninguém curtiu este deck ainda.');
  });

  it('emite fechar ao clicar no botão de fechar', () => {
    const fecharSpy = vi.fn();
    fixture.componentInstance.fechar.subscribe(fecharSpy);
    (el.querySelector('.likes-modal__close') as HTMLButtonElement).click();
    expect(fecharSpy).toHaveBeenCalled();
  });
});
