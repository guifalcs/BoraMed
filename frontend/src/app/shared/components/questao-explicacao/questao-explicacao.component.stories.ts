import type { Meta, StoryObj } from '@storybook/angular';
import { QuestaoExplicacaoComponent } from './questao-explicacao.component';

const meta: Meta<QuestaoExplicacaoComponent> = {
  title: 'Provas/QuestaoExplicacao',
  component: QuestaoExplicacaoComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<QuestaoExplicacaoComponent>;

export const ComExplicacao: Story = {
  args: {
    explicacao: 'A **eosinofilia** é o achado-chave. Eosinófilos liberam grânulos citotóxicos (MBP e ECP) que perfuram a membrana de parasitas grandes. **Alternativa correta: D.**',
    referencia: 'ABBAS, A. K. et al. Imunologia Básica. 7. ed. Rio de Janeiro: GEN Guanabara Koogan, 2025.',
  },
};

// Explicação em bloco corrido "A) … B) … C) … D) …" — separada por alternativa no display.
export const PorAlternativa: Story = {
  args: {
    explicacao:
      'A) Incorreta. O baço filtra sangue (não linfa), com organização em polpa branca e vermelha, distinta do linfonodo. ' +
      'B) Incorreta. A tonsila não tem cápsula completa nem vasos linfáticos aferentes. ' +
      'C) Correta. O linfonodo é o órgão linfoide secundário especializado na filtração da linfa, com seio subcapsular e vasos aferentes. ' +
      'D) Incorreta. O timo é órgão primário, sem nódulos linfoides ou seios, com organização corticomedular lobular.',
    referencia: 'JUNQUEIRA, L. C.; CARNEIRO, J. Histologia Básica. 14. ed. Rio de Janeiro: GEN Guanabara Koogan, 2023.',
  },
};

export const SemReferencia: Story = {
  args: {
    explicacao: 'O parassimpático **reduz** a frequência cardíaca; quem aumenta é o simpático. **Alternativa correta: D.**',
    referencia: null,
  },
};

export const SemExplicacao: Story = {
  args: {
    explicacao: null,
    referencia: null,
  },
};
