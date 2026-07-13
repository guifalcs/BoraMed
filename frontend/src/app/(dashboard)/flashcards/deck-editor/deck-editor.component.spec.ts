import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckEditorComponent } from './deck-editor.component';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

describe('DeckEditorComponent', () => {
  let fixture: ComponentFixture<DeckEditorComponent>;
  let flashcardServiceMock: {
    obterDeckComCards: ReturnType<typeof vi.fn>;
    criarDeck: ReturnType<typeof vi.fn>;
    atualizarDeck: ReturnType<typeof vi.fn>;
  };
  let toastMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  async function setup(deckId: string | null = null, deckData?: unknown): Promise<void> {
    flashcardServiceMock = {
      obterDeckComCards: vi.fn().mockResolvedValue(deckData ? { ok: true, data: deckData } : { ok: true, data: null }),
      criarDeck: vi.fn().mockResolvedValue({ ok: true, data: 'deck-novo' }),
      atualizarDeck: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    };
    toastMock = { success: vi.fn(), error: vi.fn() };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DeckEditorComponent],
      providers: [
        { provide: FlashcardService, useValue: flashcardServiceMock },
        { provide: AuthService, useValue: { user: () => ({ id: 'user-1' }) } },
        { provide: NotificationService, useValue: toastMock },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(deckId ? { deckId } : {}) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeckEditorComponent);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('começa com 1 card vazio', () => {
    expect(fixture.componentInstance['cards']().length).toBe(1);
  });

  it('adiciona um card', () => {
    fixture.componentInstance['adicionarCard']();
    expect(fixture.componentInstance['cards']().length).toBe(2);
  });

  it('não remove o último card restante', () => {
    fixture.componentInstance['removerCard'](0);
    expect(fixture.componentInstance['cards']().length).toBe(1);
    expect(toastMock.error).toHaveBeenCalledWith('O deck precisa ter ao menos 1 card.');
  });

  it('remove um card quando há mais de um', () => {
    fixture.componentInstance['adicionarCard']();
    fixture.componentInstance['removerCard'](0);
    expect(fixture.componentInstance['cards']().length).toBe(1);
  });

  it('bloqueia adicionar além do limite de 200 cards', () => {
    const component = fixture.componentInstance;
    for (let i = 1; i < 200; i++) component['adicionarCard']();
    expect(component['cards']().length).toBe(200);

    component['adicionarCard']();
    expect(component['cards']().length).toBe(200);
    expect(toastMock.error).toHaveBeenCalledWith('Máximo de 200 cards por deck.');
  });

  it('move um card de posição', () => {
    const component = fixture.componentInstance;
    component['atualizarCard'](0, 'frente', 'Primeiro');
    component['adicionarCard']();
    component['atualizarCard'](1, 'frente', 'Segundo');

    component['moverCard'](0, 1);

    expect(component['cards']()[0].frente).toBe('Segundo');
    expect(component['cards']()[1].frente).toBe('Primeiro');
  });

  describe('carrossel', () => {
    it('adicionarCard insere após o card ativo e navega até ele', () => {
      const component = fixture.componentInstance;
      component['atualizarCard'](0, 'frente', 'Primeiro');
      component['adicionarCard']();

      expect(component['indiceCardAtivo']()).toBe(1);

      component['irParaCard'](0);
      component['adicionarCard']();

      expect(component['cards']().length).toBe(3);
      expect(component['indiceCardAtivo']()).toBe(1);
      expect(component['cards']()[0].frente).toBe('Primeiro');
      expect(component['cards']()[1].frente).toBe('');
    });

    it('removerCard mantém o índice ativo dentro dos limites', () => {
      const component = fixture.componentInstance;
      component['adicionarCard']();
      component['adicionarCard']();
      expect(component['indiceCardAtivo']()).toBe(2);

      component['removerCard'](2);
      expect(component['indiceCardAtivo']()).toBe(1);

      component['removerCard'](0);
      expect(component['indiceCardAtivo']()).toBe(0);
      expect(component['cards']().length).toBe(1);
    });

    it('moverCard acompanha o card movido no carrossel', () => {
      const component = fixture.componentInstance;
      component['atualizarCard'](0, 'frente', 'A');
      component['adicionarCard']();
      component['atualizarCard'](1, 'frente', 'B');
      component['irParaCard'](0);

      component['moverCard'](0, 1);

      expect(component['cards']()[1].frente).toBe('A');
      expect(component['indiceCardAtivo']()).toBe(1);
    });

    it('irParaCard ignora índices fora dos limites', () => {
      const component = fixture.componentInstance;
      component['irParaCard'](-1);
      expect(component['indiceCardAtivo']()).toBe(0);
      component['irParaCard'](5);
      expect(component['indiceCardAtivo']()).toBe(0);
    });
  });

  it('exige título com ao menos 3 caracteres', async () => {
    const component = fixture.componentInstance;
    component['titulo'].set('ab');
    component['atualizarCard'](0, 'frente', 'F');
    component['atualizarCard'](0, 'verso', 'V');

    await component['salvar']();

    expect(component['erro']()).toBe('O título deve ter entre 3 e 120 caracteres.');
    expect(flashcardServiceMock.criarDeck).not.toHaveBeenCalled();
  });

  it('exige ao menos 1 card com frente e verso preenchidos', async () => {
    const component = fixture.componentInstance;
    component['titulo'].set('Deck válido');

    await component['salvar']();

    expect(component['erro']()).toBe('Adicione ao menos 1 card com frente e verso preenchidos (texto ou imagem).');
    expect(flashcardServiceMock.criarDeck).not.toHaveBeenCalled();
  });

  it('bloqueia card com apenas um lado preenchido', async () => {
    const component = fixture.componentInstance;
    component['titulo'].set('Deck válido');
    component['atualizarCard'](0, 'frente', 'Só frente');

    await component['salvar']();

    expect(component['erro']()).toBe('O card 1 está incompleto: preencha frente e verso com texto ou imagem.');
    expect(flashcardServiceMock.criarDeck).not.toHaveBeenCalled();
  });

  it('aceita card com imagem em vez de texto nos dois lados', async () => {
    const component = fixture.componentInstance;
    component['titulo'].set('Deck com imagens');
    component['atualizarCard'](0, 'frenteImagemUrl', 'https://x.supabase.co/storage/v1/object/public/flashcard-imagens/user/user-1/f.webp');
    component['atualizarCard'](0, 'versoImagemUrl', 'https://x.supabase.co/storage/v1/object/public/flashcard-imagens/user/user-1/v.webp');

    await component['salvar']();

    expect(component['erro']()).toBeNull();
    expect(flashcardServiceMock.criarDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: [expect.objectContaining({ frente: '', verso: '' })],
      }),
    );
  });

  it('aceita card misto: texto na frente e imagem no verso', async () => {
    const component = fixture.componentInstance;
    component['titulo'].set('Deck misto');
    component['atualizarCard'](0, 'frente', 'Pergunta');
    component['atualizarCard'](0, 'versoImagemUrl', 'https://x.supabase.co/storage/v1/object/public/flashcard-imagens/user/user-1/v.webp');

    await component['salvar']();

    expect(component['erro']()).toBeNull();
    expect(flashcardServiceMock.criarDeck).toHaveBeenCalled();
  });

  it('exibe o erro de palavra proibida (P0010) retornado pelo service', async () => {
    flashcardServiceMock.criarDeck.mockResolvedValue({
      ok: false,
      error: 'Seu deck contém palavras não permitidas.',
    });

    const component = fixture.componentInstance;
    component['titulo'].set('Deck válido');
    component['atualizarCard'](0, 'frente', 'Palavra ofensiva');
    component['atualizarCard'](0, 'verso', 'Resposta');

    await component['salvar']();

    expect(toastMock.error).toHaveBeenCalledWith('Seu deck contém palavras não permitidas.');
  });

  it('cria o deck com sucesso e chama criarDeck com o payload correto', async () => {
    const component = fixture.componentInstance;
    component['titulo'].set('Deck válido');
    component['atualizarCard'](0, 'frente', 'Pergunta');
    component['atualizarCard'](0, 'verso', 'Resposta');

    await component['salvar']();

    expect(flashcardServiceMock.criarDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Deck válido',
        cards: [expect.objectContaining({ frente: 'Pergunta', verso: 'Resposta' })],
      }),
    );
    expect(toastMock.success).toHaveBeenCalled();
  });

  describe('modo edição', () => {
    it('carrega o deck existente e chama atualizarDeck ao salvar', async () => {
      await setup('deck-1', {
        id: 'deck-1',
        user_id: 'user-1',
        oficial: false,
        titulo: 'Deck existente',
        descricao: 'Desc',
        publico: false,
        likes_count: 0,
        cards_count: 1,
        criado_em: '2026-01-01T00:00:00Z',
        atualizado_em: '2026-01-01T00:00:00Z',
        cards: [
          {
            id: 'card-1',
            deck_id: 'deck-1',
            posicao: 0,
            frente: 'F',
            verso: 'V',
            frente_imagem_url: null,
            verso_imagem_url: null,
            criado_em: '2026-01-01T00:00:00Z',
            atualizado_em: '2026-01-01T00:00:00Z',
          },
        ],
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['titulo']()).toBe('Deck existente');

      await fixture.componentInstance['salvar']();

      expect(flashcardServiceMock.atualizarDeck).toHaveBeenCalledWith(
        expect.objectContaining({ deckId: 'deck-1', titulo: 'Deck existente' }),
      );
    });
  });
});
