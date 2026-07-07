import type { Meta, StoryObj } from '@storybook/angular';
import { RespostaAbertaInputComponent } from './resposta-aberta-input.component';

const meta: Meta<RespostaAbertaInputComponent> = {
  title: 'Provas/RespostaAbertaInput',
  component: RespostaAbertaInputComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<RespostaAbertaInputComponent>;

export const Rascunho: Story = {
  args: {
    textoInicial: '',
    estado: 'rascunho',
  },
};

export const RascunhoRestaurado: Story = {
  args: {
    textoInicial: 'A tríade de Charcot é composta por febre, icterícia e dor em hipocôndrio direito, sugerindo colangite aguda.',
    estado: 'rascunho',
  },
};

export const Enviando: Story = {
  args: {
    textoInicial: 'A tríade de Charcot é composta por febre, icterícia e dor em hipocôndrio direito.',
    estado: 'enviando',
  },
};

export const Enviada: Story = {
  args: {
    textoInicial: 'A tríade de Charcot é composta por febre, icterícia e dor em hipocôndrio direito, sugerindo colangite aguda.',
    estado: 'enviada',
  },
};

export const Desabilitado: Story = {
  args: {
    textoInicial: 'Rascunho travado…',
    estado: 'rascunho',
    desabilitado: true,
  },
};
