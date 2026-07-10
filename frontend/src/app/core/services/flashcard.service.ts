import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type {
  AtualizarDeckPayload,
  CriarDeckPayload,
  DeckLikeUsuario,
  FeedDeck,
  Flashcard,
  FlashcardDeck,
  FlashcardDeckComCards,
  OrdenacaoFeedFlashcards,
  ToggleLikeResultado,
} from '../models/flashcard';

export type FlashcardResult<T> = { ok: true; data: T } | { ok: false; error: string };

const DECK_COLUMNS =
  'id, user_id, oficial, titulo, descricao, publico, likes_count, cards_count, criado_em, atualizado_em';

const CARD_COLUMNS =
  'id, deck_id, posicao, frente, verso, frente_imagem_url, verso_imagem_url, criado_em, atualizado_em';

const FEED_PAGE_SIZE = 20;

const ERRO_PALAVRA_PROIBIDA = 'Seu deck contém palavras não permitidas.';

@Injectable({ providedIn: 'root' })
export class FlashcardService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _feed = signal<FeedDeck[]>([]);
  private readonly _feedLoading = signal(false);
  private readonly _feedOrdenacao = signal<OrdenacaoFeedFlashcards>('recentes');
  private readonly _feedOffset = signal(0);
  private readonly _feedTemMais = signal(true);

  readonly feed = this._feed.asReadonly();
  readonly feedLoading = this._feedLoading.asReadonly();
  readonly feedOrdenacao = this._feedOrdenacao.asReadonly();
  readonly feedTemMais = this._feedTemMais.asReadonly();

  async listarDecksOficiais(): Promise<FlashcardResult<FlashcardDeck[]>> {
    try {
      const { data, error } = await this.supabase
        .from('flashcard_decks')
        .select(DECK_COLUMNS)
        .eq('oficial', true)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return { ok: true, data: (data ?? []) as FlashcardDeck[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar os decks oficiais.' };
    }
  }

  async listarMeusDecks(): Promise<FlashcardResult<FlashcardDeck[]>> {
    try {
      const user = this.auth.user();
      if (!user) return { ok: true, data: [] };

      const { data, error } = await this.supabase
        .from('flashcard_decks')
        .select(DECK_COLUMNS)
        .eq('oficial', false)
        .eq('user_id', user.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return { ok: true, data: (data ?? []) as FlashcardDeck[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar seus decks.' };
    }
  }

  async obterDeckComCards(deckId: string): Promise<FlashcardResult<FlashcardDeckComCards>> {
    try {
      const { data, error } = await this.supabase
        .from('flashcard_decks')
        .select(`${DECK_COLUMNS}, flashcard_cards(${CARD_COLUMNS})`)
        .eq('id', deckId)
        .order('posicao', { referencedTable: 'flashcard_cards', ascending: true })
        .single();

      if (error) throw error;

      const raw = data as unknown as FlashcardDeck & { flashcard_cards: Flashcard[] | null };
      const { flashcard_cards, ...deck } = raw;

      return {
        ok: true,
        data: { ...deck, cards: flashcard_cards ?? [] },
      };
    } catch {
      return { ok: false, error: 'Deck não encontrado.' };
    }
  }

  async criarDeck(payload: CriarDeckPayload): Promise<FlashcardResult<string>> {
    try {
      const { data, error } = await this.supabase.rpc('flashcards_criar_deck', {
        p_titulo: payload.titulo,
        p_descricao: payload.descricao,
        p_publico: payload.publico,
        p_cards: payload.cards,
      });

      if (error) return { ok: false, error: this._mapearErro(error) };
      return { ok: true, data: data as string };
    } catch {
      return { ok: false, error: 'Não foi possível criar o deck.' };
    }
  }

  async atualizarDeck(payload: AtualizarDeckPayload): Promise<FlashcardResult<void>> {
    try {
      const { error } = await this.supabase.rpc('flashcards_atualizar_deck', {
        p_deck_id: payload.deckId,
        p_titulo: payload.titulo,
        p_descricao: payload.descricao,
        p_publico: payload.publico,
        p_cards: payload.cards,
      });

      if (error) return { ok: false, error: this._mapearErro(error) };
      return { ok: true, data: undefined };
    } catch {
      return { ok: false, error: 'Não foi possível atualizar o deck.' };
    }
  }

  async excluirDeck(deckId: string): Promise<FlashcardResult<void>> {
    try {
      const { error } = await this.supabase.rpc('flashcards_excluir_deck', {
        p_deck_id: deckId,
      });

      if (error) return { ok: false, error: this._mapearErro(error) };
      return { ok: true, data: undefined };
    } catch {
      return { ok: false, error: 'Não foi possível excluir o deck.' };
    }
  }

  /** Toggle de like com update otimista no signal do feed; rollback em caso de erro. */
  async toggleLike(deckId: string): Promise<FlashcardResult<ToggleLikeResultado>> {
    const estadoAnterior = this._feed().find((d) => d.id === deckId);
    if (!estadoAnterior) return { ok: false, error: 'Deck não encontrado no feed.' };

    const curtidoOtimista = !estadoAnterior.curtido_por_mim;
    const likesOtimista = estadoAnterior.likes_count + (curtidoOtimista ? 1 : -1);

    this._aplicarLike(deckId, curtidoOtimista, Math.max(0, likesOtimista));

    try {
      const { data, error } = await this.supabase.rpc('flashcards_toggle_like', {
        p_deck_id: deckId,
      });

      if (error) {
        this._aplicarLike(deckId, estadoAnterior.curtido_por_mim, estadoAnterior.likes_count);
        return { ok: false, error: this._mapearErro(error) };
      }

      const resultado = (Array.isArray(data) ? data[0] : data) as ToggleLikeResultado;
      this._aplicarLike(deckId, resultado.curtido, resultado.likes_count);
      return { ok: true, data: resultado };
    } catch {
      this._aplicarLike(deckId, estadoAnterior.curtido_por_mim, estadoAnterior.likes_count);
      return { ok: false, error: 'Não foi possível registrar a curtida.' };
    }
  }

  /**
   * Carrega uma página do feed da comunidade. `offset = 0` reinicia a lista;
   * offsets subsequentes acumulam (padrão "carregar mais").
   */
  async carregarFeed(
    ordenacao: OrdenacaoFeedFlashcards,
    offset = 0,
  ): Promise<FlashcardResult<FeedDeck[]>> {
    this._feedLoading.set(true);
    this._feedOrdenacao.set(ordenacao);

    try {
      const { data, error } = await this.supabase.rpc('flashcards_feed', {
        p_ordenacao: ordenacao,
        p_limit: FEED_PAGE_SIZE,
        p_offset: offset,
      });

      if (error) return { ok: false, error: this._mapearErro(error) };

      const pagina = (data ?? []) as FeedDeck[];

      this._feed.update((prev) => (offset === 0 ? pagina : [...prev, ...pagina]));
      this._feedOffset.set(offset + pagina.length);
      this._feedTemMais.set(pagina.length === FEED_PAGE_SIZE);

      return { ok: true, data: pagina };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o feed da comunidade.' };
    } finally {
      this._feedLoading.set(false);
    }
  }

  async listarLikesDeck(
    deckId: string,
    limit = 50,
    offset = 0,
  ): Promise<FlashcardResult<DeckLikeUsuario[]>> {
    try {
      const { data, error } = await this.supabase.rpc('flashcards_listar_likes_deck', {
        p_deck_id: deckId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) return { ok: false, error: this._mapearErro(error) };
      return { ok: true, data: (data ?? []) as DeckLikeUsuario[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar quem curtiu o deck.' };
    }
  }

  private _aplicarLike(deckId: string, curtido: boolean, likesCount: number): void {
    this._feed.update((prev) =>
      prev.map((d) => (d.id === deckId ? { ...d, curtido_por_mim: curtido, likes_count: likesCount } : d)),
    );
  }

  private _mapearErro(error: { code?: string; message?: string }): string {
    if (error.code === 'P0010') return ERRO_PALAVRA_PROIBIDA;
    return error.message ?? 'Ocorreu um erro inesperado.';
  }
}
