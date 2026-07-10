/** Modelos do módulo de Flashcards (decks, cards, likes, feed). */

export interface Flashcard {
  id: string;
  deck_id: string;
  posicao: number;
  frente: string;
  verso: string;
  frente_imagem_url: string | null;
  verso_imagem_url: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface FlashcardDeck {
  id: string;
  user_id: string | null;
  oficial: boolean;
  titulo: string;
  descricao: string | null;
  publico: boolean;
  likes_count: number;
  cards_count: number;
  criado_em: string;
  atualizado_em: string;
}

/** Deck com os cards embutidos, já ordenados por posição. */
export interface FlashcardDeckComCards extends FlashcardDeck {
  cards: Flashcard[];
}

/** Resumo de deck usado em listagens (oficiais / meus decks). */
export type FlashcardDeckResumo = FlashcardDeck;

/** Item do feed da comunidade (RPC flashcards_feed). */
export interface FeedDeck {
  id: string;
  titulo: string;
  descricao: string | null;
  likes_count: number;
  cards_count: number;
  criado_em: string;
  autor_id: string;
  autor_nome: string;
  curtido_por_mim: boolean;
}

/** Ordenação do feed da comunidade. */
export type OrdenacaoFeedFlashcards = 'recentes' | 'curtidos';

/** Usuário que curtiu um deck (RPC flashcards_listar_likes_deck). */
export interface DeckLikeUsuario {
  user_id: string;
  nome: string;
  avatar_url: string | null;
  criado_em: string;
}

/** Payload de um card ao criar/atualizar um deck (jsonb enviado à RPC). */
export interface FlashcardCardPayload {
  frente: string;
  verso: string;
  frente_imagem_url?: string | null;
  verso_imagem_url?: string | null;
}

/** Payload para criar um deck via RPC flashcards_criar_deck. */
export interface CriarDeckPayload {
  titulo: string;
  descricao: string | null;
  publico: boolean;
  cards: FlashcardCardPayload[];
}

/** Payload para atualizar um deck via RPC flashcards_atualizar_deck. */
export interface AtualizarDeckPayload extends CriarDeckPayload {
  deckId: string;
}

/** Resultado de um toggle de like (RPC flashcards_toggle_like). */
export interface ToggleLikeResultado {
  curtido: boolean;
  likes_count: number;
}

/**
 * Resultado local (não persistido) de uma sessão de estudo de flashcards.
 * Usado só na tela de execução — nunca gravado no banco.
 */
export interface ResultadoSessao {
  acertos: number;
  erros: number;
  pulados: number;
}
