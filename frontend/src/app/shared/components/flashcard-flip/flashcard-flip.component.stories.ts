import { componentWrapperDecorator, type Meta, type StoryObj } from '@storybook/angular';
import { FlashcardFlipComponent } from './flashcard-flip.component';

const meta: Meta<FlashcardFlipComponent> = {
  title: 'Flashcards/FlashcardFlip',
  component: FlashcardFlipComponent,
  tags: ['autodocs'],
  args: {
    frente: 'Qual o principal neurotransmissor excitatório do SNC?',
    verso: 'Glutamato.',
  },
  // O componente preenche a altura do container pai (como na tela de execução).
  decorators: [componentWrapperDecorator((story) => `<div style="height: 420px; max-width: 720px;">${story}</div>`)],
};

export default meta;
type Story = StoryObj<FlashcardFlipComponent>;

export const Frente: Story = {};

export const Virado: Story = { args: { virado: true } };

export const ComImagens: Story = {
  args: {
    frente: 'Que estrutura está indicada na lâmina?',
    verso: 'Glomérulo renal.',
    frenteImagemUrl: 'https://placehold.co/640x420?text=Frente',
    versoImagemUrl: 'https://placehold.co/640x420?text=Verso',
  },
};

// Retrato + texto: imagem em cima, texto embaixo. Na tela de estudo o card recebe
// mais altura (via retratoChange) para valorizar a imagem; aqui o container é fixo.
export const ImagemRetrato: Story = {
  args: {
    frente: 'Identifique a peça anatômica.',
    verso: 'Fêmur direito.',
    frenteImagemUrl: 'https://placehold.co/400x700?text=Retrato',
    versoImagemUrl: 'https://placehold.co/400x700?text=Retrato',
  },
};

// Retrato sem texto (clássico "identifique a peça"): imagem ocupa o card inteiro;
// o botão de ampliar abre o lightbox para ver em tela cheia.
export const ImagemRetratoSemTexto: Story = {
  args: {
    frente: '',
    verso: '',
    frenteImagemUrl: 'https://placehold.co/400x760?text=So+imagem',
    versoImagemUrl: 'https://placehold.co/400x760?text=So+imagem',
  },
};

// Retrato + texto longo: valida que a coluna de texto rola/quebra ao lado da imagem.
export const ImagemRetratoTextoLongo: Story = {
  args: {
    frente: 'Descreva a estrutura em destaque e sua função no contexto histológico apresentado.',
    verso:
      'Glomérulo renal: enovelado de capilares responsável pela filtração do plasma, primeira etapa da formação da urina no néfron.',
    frenteImagemUrl: 'https://placehold.co/400x700?text=Retrato',
    versoImagemUrl: 'https://placehold.co/400x700?text=Retrato',
  },
};

export const ImagemPaisagem: Story = {
  args: {
    frente: 'Qual o achado no ECG?',
    verso: 'Fibrilação atrial.',
    frenteImagemUrl: 'https://placehold.co/900x300?text=Paisagem',
    versoImagemUrl: 'https://placehold.co/900x300?text=Paisagem',
  },
};

export const TextoLongo: Story = {
  args: {
    frente: 'Descreva as etapas do ciclo de Krebs e as enzimas envolvidas em cada uma delas.',
    verso:
      'Citrato sintase, aconitase, isocitrato desidrogenase, alfa-cetoglutarato desidrogenase, succinil-CoA sintetase, succinato desidrogenase, fumarase e malato desidrogenase.',
  },
};

export const TextoExtremo: Story = {
  args: {
    frente: 'Explique detalhadamente a fisiopatologia da insuficiência cardíaca com fração de ejeção reduzida.',
    verso:
      'A insuficiência cardíaca com fração de ejeção reduzida (ICFEr) resulta de disfunção sistólica do ventrículo esquerdo. '.repeat(
        8,
      ),
  },
};
