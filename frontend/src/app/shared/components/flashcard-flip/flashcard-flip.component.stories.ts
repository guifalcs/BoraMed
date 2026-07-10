import type { Meta, StoryObj } from '@storybook/angular';
import { FlashcardFlipComponent } from './flashcard-flip.component';

const meta: Meta<FlashcardFlipComponent> = {
  title: 'Flashcards/FlashcardFlip',
  component: FlashcardFlipComponent,
  tags: ['autodocs'],
  args: {
    frente: 'Qual o principal neurotransmissor excitatório do SNC?',
    verso: 'Glutamato.',
  },
};

export default meta;
type Story = StoryObj<FlashcardFlipComponent>;

export const Frente: Story = {};

export const Virado: Story = { args: { virado: true } };

export const ComImagens: Story = {
  args: {
    frenteImagemUrl: 'https://placehold.co/300x180?text=Frente',
    versoImagemUrl: 'https://placehold.co/300x180?text=Verso',
  },
};

export const TextoLongo: Story = {
  args: {
    frente: 'Descreva as etapas do ciclo de Krebs e as enzimas envolvidas em cada uma delas.',
    verso:
      'Citrato sintase, aconitase, isocitrato desidrogenase, alfa-cetoglutarato desidrogenase, succinil-CoA sintetase, succinato desidrogenase, fumarase e malato desidrogenase.',
  },
};
