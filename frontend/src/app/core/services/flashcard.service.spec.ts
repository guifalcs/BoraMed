import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardService } from './flashcard.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { CriarDeckPayload, FeedDeck } from '../models/flashcard';

const feedDeck = (overrides: Partial<FeedDeck> = {}): FeedDeck => ({
  id: 'deck-1',
  titulo: 'Cardiologia básica',
  descricao: null,
  likes_count: 3,
  cards_count: 10,
  criado_em: '2026-07-01T00:00:00Z',
  autor_id: 'autor-1',
  autor_nome: 'Fulano',
  curtido_por_mim: false,
  ...overrides,
});

describe('FlashcardService', () => {
  let service: FlashcardService;
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();
  const mockUser = vi.fn<() => { id: string } | null>(() => ({ id: 'user-1' }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.mockReturnValue({ id: 'user-1' });
    TestBed.configureTestingModule({
      providers: [
        FlashcardService,
        { provide: SupabaseService, useValue: { client: { rpc: mockRpc, from: mockFrom } } },
        { provide: AuthService, useValue: { user: mockUser } },
      ],
    });
    service = TestBed.inject(FlashcardService);
  });

  describe('listarMeusDecks', () => {
    it('escopa a consulta ao usuário autenticado (nunca confia só na RLS)', async () => {
      const eq = vi.fn().mockReturnThis();
      const order = vi.fn().mockResolvedValue({ data: [], error: null });
      const select = vi.fn().mockReturnValue({ eq, order });
      mockFrom.mockReturnValue({ select });
      eq.mockReturnValue({ eq, order });

      await service.listarMeusDecks();

      expect(mockFrom).toHaveBeenCalledWith('flashcard_decks');
      expect(eq).toHaveBeenCalledWith('oficial', false);
      expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(eq).toHaveBeenCalledWith('flashcard_deck_likes.user_id', 'user-1');
    });

    it('mapeia o embed de likes para curtido_por_mim', async () => {
      const deckBase = {
        id: 'deck-1',
        user_id: 'user-1',
        oficial: false,
        titulo: 'Meu deck',
        descricao: null,
        publico: true,
        likes_count: 2,
        cards_count: 1,
        criado_em: '2026-07-01T00:00:00Z',
        atualizado_em: '2026-07-01T00:00:00Z',
      };
      const eq = vi.fn().mockReturnThis();
      const order = vi.fn().mockResolvedValue({
        data: [
          { ...deckBase, flashcard_deck_likes: [{ user_id: 'user-1' }] },
          { ...deckBase, id: 'deck-2', flashcard_deck_likes: [] },
        ],
        error: null,
      });
      const select = vi.fn().mockReturnValue({ eq, order });
      mockFrom.mockReturnValue({ select });
      eq.mockReturnValue({ eq, order });

      const result = await service.listarMeusDecks();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].curtido_por_mim).toBe(true);
        expect(result.data[1].curtido_por_mim).toBe(false);
        expect('flashcard_deck_likes' in result.data[0]).toBe(false);
      }
    });

    it('retorna lista vazia sem consultar o banco quando não há usuário autenticado', async () => {
      mockUser.mockReturnValue(null);

      const result = await service.listarMeusDecks();

      expect(result).toEqual({ ok: true, data: [] });
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('mapeamento de erros', () => {
    it('mapeia errcode P0010 para mensagem amigável em criarDeck', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'P0010', message: 'linguagem inapropriada' } });

      const payload: CriarDeckPayload = {
        titulo: 'Deck teste',
        descricao: null,
        publico: false,
        cards: [{ frente: 'a', verso: 'b' }],
      };

      const result = await service.criarDeck(payload);

      expect(result).toEqual({ ok: false, error: 'Seu deck contém palavras não permitidas.' });
    });

    it('mapeia errcode P0010 em atualizarDeck', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'P0010', message: 'linguagem inapropriada' } });

      const result = await service.atualizarDeck({
        deckId: 'deck-1',
        titulo: 'Deck teste',
        descricao: null,
        publico: false,
        cards: [{ frente: 'a', verso: 'b' }],
      });

      expect(result).toEqual({ ok: false, error: 'Seu deck contém palavras não permitidas.' });
    });

    it('propaga a mensagem original para outros errcodes', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'P0007', message: 'Deck não encontrado ou sem permissao' } });

      const result = await service.excluirDeck('deck-1');

      expect(result).toEqual({ ok: false, error: 'Deck não encontrado ou sem permissao' });
    });
  });

  describe('toggleLike otimista', () => {
    async function carregarFeedComDeck(deck: FeedDeck): Promise<void> {
      mockRpc.mockResolvedValueOnce({ data: [deck], error: null });
      await service.carregarFeed('recentes', 0);
    }

    it('aplica otimisticamente e confirma com o retorno do servidor', async () => {
      const deck = feedDeck({ curtido_por_mim: false, likes_count: 3 });
      await carregarFeedComDeck(deck);

      mockRpc.mockResolvedValueOnce({ data: [{ curtido: true, likes_count: 4 }], error: null });

      const promise = service.toggleLike('deck-1');

      // Otimista, antes da RPC resolver:
      expect(service.feed()[0].curtido_por_mim).toBe(true);
      expect(service.feed()[0].likes_count).toBe(4);

      const result = await promise;

      expect(result).toEqual({ ok: true, data: { curtido: true, likes_count: 4 } });
      expect(service.feed()[0].curtido_por_mim).toBe(true);
      expect(service.feed()[0].likes_count).toBe(4);
    });

    it('reverte o estado otimista quando a RPC falha', async () => {
      const deck = feedDeck({ curtido_por_mim: false, likes_count: 3 });
      await carregarFeedComDeck(deck);

      mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0013', message: 'Nao e possivel curtir o proprio deck' } });

      const result = await service.toggleLike('deck-1');

      expect(result).toEqual({ ok: false, error: 'Nao e possivel curtir o proprio deck' });
      expect(service.feed()[0].curtido_por_mim).toBe(false);
      expect(service.feed()[0].likes_count).toBe(3);
    });

    it('curte deck fora do feed (ex.: meus decks) chamando a RPC sem update otimista', async () => {
      mockRpc.mockResolvedValueOnce({ data: [{ curtido: true, likes_count: 1 }], error: null });

      const result = await service.toggleLike('meu-deck-1');

      expect(mockRpc).toHaveBeenCalledWith('flashcards_toggle_like', { p_deck_id: 'meu-deck-1' });
      expect(result).toEqual({ ok: true, data: { curtido: true, likes_count: 1 } });
      expect(service.feed()).toEqual([]);
    });
  });

  describe('payload jsonb de cards', () => {
    it('monta o payload de criarDeck com os campos exatos esperados pela RPC', async () => {
      mockRpc.mockResolvedValue({ data: 'novo-deck-id', error: null });

      const payload: CriarDeckPayload = {
        titulo: 'Farmacologia',
        descricao: 'Cards de revisão',
        publico: true,
        cards: [
          { frente: 'O que é X?', verso: 'X é...', frente_imagem_url: null, verso_imagem_url: null },
          { frente: 'O que é Y?', verso: 'Y é...' },
        ],
      };

      const result = await service.criarDeck(payload);

      expect(result).toEqual({ ok: true, data: 'novo-deck-id' });
      expect(mockRpc).toHaveBeenCalledWith('flashcards_criar_deck', {
        p_titulo: 'Farmacologia',
        p_descricao: 'Cards de revisão',
        p_publico: true,
        p_cards: payload.cards,
      });
    });

    it('monta o payload de atualizarDeck incluindo p_deck_id', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await service.atualizarDeck({
        deckId: 'deck-1',
        titulo: 'Farmacologia',
        descricao: null,
        publico: false,
        cards: [{ frente: 'a', verso: 'b' }],
      });

      expect(mockRpc).toHaveBeenCalledWith('flashcards_atualizar_deck', {
        p_deck_id: 'deck-1',
        p_titulo: 'Farmacologia',
        p_descricao: null,
        p_publico: false,
        p_cards: [{ frente: 'a', verso: 'b' }],
      });
    });
  });

  describe('feed com paginação/acumulação', () => {
    it('reinicia a lista quando offset é 0 e acumula em páginas seguintes', async () => {
      const pagina1 = Array.from({ length: 20 }, (_, i) => feedDeck({ id: `deck-${i}` }));
      mockRpc.mockResolvedValueOnce({ data: pagina1, error: null });

      const result1 = await service.carregarFeed('recentes', 0);
      expect(result1).toEqual({ ok: true, data: pagina1 });
      expect(service.feed()).toHaveLength(20);
      expect(service.feedTemMais()).toBe(true);

      const pagina2 = [feedDeck({ id: 'deck-extra' })];
      mockRpc.mockResolvedValueOnce({ data: pagina2, error: null });

      const result2 = await service.carregarFeed('recentes', 20);
      expect(result2).toEqual({ ok: true, data: pagina2 });
      expect(service.feed()).toHaveLength(21);
      expect(service.feedTemMais()).toBe(false);

      expect(mockRpc).toHaveBeenNthCalledWith(1, 'flashcards_feed', {
        p_ordenacao: 'recentes',
        p_limit: 20,
        p_offset: 0,
      });
      expect(mockRpc).toHaveBeenNthCalledWith(2, 'flashcards_feed', {
        p_ordenacao: 'recentes',
        p_limit: 20,
        p_offset: 20,
      });
    });

    it('reinicia o feed ao carregar com offset 0 novamente (nova ordenação)', async () => {
      mockRpc.mockResolvedValueOnce({ data: [feedDeck({ id: 'a' })], error: null });
      await service.carregarFeed('recentes', 0);
      expect(service.feed()).toHaveLength(1);

      mockRpc.mockResolvedValueOnce({ data: [feedDeck({ id: 'b' }), feedDeck({ id: 'c' })], error: null });
      await service.carregarFeed('curtidos', 0);

      expect(service.feed()).toHaveLength(2);
      expect(service.feedOrdenacao()).toBe('curtidos');
    });

    it('propaga erro do RPC sem alterar o feed', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Assinatura ativa necessaria' } });

      const result = await service.carregarFeed('recentes', 0);

      expect(result).toEqual({ ok: false, error: 'Assinatura ativa necessaria' });
      expect(service.feed()).toEqual([]);
    });
  });
});
