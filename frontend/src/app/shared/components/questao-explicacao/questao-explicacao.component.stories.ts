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
