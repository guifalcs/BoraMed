import type { Meta, StoryObj } from '@storybook/angular';
import { RespostaPadraoComponent } from './resposta-padrao.component';

const meta: Meta<RespostaPadraoComponent> = {
  title: 'Provas/RespostaPadrao',
  component: RespostaPadraoComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<RespostaPadraoComponent>;

export const Completa: Story = {
  args: {
    respostaModelo:
      'A **tríade de Charcot** é composta por febre, icterícia e dor em hipocôndrio direito, e sugere colangite aguda. A conduta inicial inclui antibioticoterapia precoce e drenagem biliar.',
    pontosChave: ['Cita febre', 'Cita icterícia', 'Cita dor em hipocôndrio direito', 'Menciona antibioticoterapia precoce'],
  },
};

export const SoResposta: Story = {
  args: {
    respostaModelo: 'O parassimpático **reduz** a frequência cardíaca via nervo vago.',
    pontosChave: [],
  },
};

export const Vazia: Story = {
  args: {
    respostaModelo: null,
    pontosChave: [],
  },
};
