import type { Meta, StoryObj } from '@storybook/angular';
import { DeckCardComponent } from './deck-card.component';
import type { FeedDeck, FlashcardDeck } from '../../../core/models/flashcard';

const deckOficial: FlashcardDeck = {
  id: 'deck-1',
  user_id: null,
  oficial: true,
  titulo: 'Farmacologia — Antibióticos',
  descricao: 'Principais classes e mecanismos de ação.',
  publico: false,
  likes_count: 0,
  cards_count: 24,
  criado_em: '2026-01-01T00:00:00Z',
  atualizado_em: '2026-01-01T00:00:00Z',
};

const deckUsuario: FlashcardDeck = {
  id: 'deck-2',
  user_id: 'user-1',
  oficial: false,
  titulo: 'Anatomia do coração',
  descricao: 'Câmaras, valvas e grandes vasos.',
  publico: true,
  likes_count: 12,
  cards_count: 40,
  criado_em: '2026-02-10T00:00:00Z',
  atualizado_em: '2026-02-10T00:00:00Z',
};

const feedDeck: FeedDeck = {
  id: 'deck-3',
  titulo: 'Bioquímica do ciclo de Krebs',
  descricao: 'Etapas e enzimas-chave.',
  likes_count: 8,
  cards_count: 15,
  criado_em: '2026-06-01T00:00:00Z',
  autor_id: 'user-2',
  autor_nome: 'Maria Silva',
  curtido_por_mim: false,
};

const meta: Meta<DeckCardComponent> = {
  title: 'Flashcards/DeckCard',
  component: DeckCardComponent,
  tags: ['autodocs'],
  args: { deck: deckOficial },
};

export default meta;
type Story = StoryObj<DeckCardComponent>;

export const Oficial: Story = {};

// Deck oficial publicado (aba Oficiais): NÃO mostra coração — curtidas são só da Comunidade.
export const OficialPublicado: Story = {
  args: { deck: { ...deckOficial, publico: true } },
};

export const MeusDecksComAcoes: Story = {
  args: { deck: deckUsuario, mostrarAcoes: true },
};

export const Comunidade: Story = {
  args: { deck: feedDeck, mostrarAutor: true },
};

export const ComunidadeCurtido: Story = {
  args: { deck: { ...feedDeck, curtido_por_mim: true, likes_count: 9 }, mostrarAutor: true },
};

export const SemDescricao: Story = {
  args: { deck: { ...deckOficial, descricao: null } },
};

export const ConteudoLongo: Story = {
  args: {
    deck: {
      ...deckOficial,
      titulo: 'Farmacologia Avançada — Interações Medicamentosas, Farmacogenômica e Reações Adversas em Populações Especiais',
      descricao:
        'Deck extenso cobrindo interações fármaco-fármaco, fármaco-alimento, polimorfismos de CYP450, ajustes de dose em insuficiência renal e hepática, e notificação de reações adversas. O texto excedente é truncado com reticências para manter os cards do grid com a mesma altura.',
    },
  },
};
