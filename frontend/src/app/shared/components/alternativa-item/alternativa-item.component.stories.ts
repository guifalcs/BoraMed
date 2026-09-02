import type { Meta, StoryObj } from '@storybook/angular';
import { AlternativaItemComponent } from './alternativa-item.component';

const alternativa = {
  id: 'alt-a',
  questao_id: 'q1',
  letra: 'A' as const,
  texto: 'Administração de adrenalina intramuscular imediatamente',
  correta: false,
  ordem: 1,
  imagem_url: null,
};

const meta: Meta<AlternativaItemComponent> = {
  title: 'Provas/AlternativaItem',
  component: AlternativaItemComponent,
  tags: ['autodocs'],
  args: { alternativa, estado: 'idle' },
  argTypes: {
    estado: {
      control: 'inline-radio',
      options: ['idle', 'selecionada', 'correta', 'errada', 'desabilitada'],
    },
  },
};

export default meta;
type Story = StoryObj<AlternativaItemComponent>;

export const Idle: Story = {};

export const Selecionada: Story = { args: { estado: 'selecionada' } };

export const Correta: Story = { args: { estado: 'correta' } };

export const Errada: Story = { args: { estado: 'errada' } };

export const Desabilitada: Story = { args: { estado: 'desabilitada' } };

/** Botão de riscar disponível — discreto até o hover no desktop. */
export const PodeEliminar: Story = { args: { podeEliminar: true } };

export const Eliminada: Story = { args: { podeEliminar: true, eliminada: true } };

export const EliminadaTextoLongo: Story = {
  args: {
    podeEliminar: true,
    eliminada: true,
    alternativa: {
      ...alternativa,
      texto:
        'Iniciar antibioticoterapia empírica de amplo espectro por via endovenosa e solicitar hemoculturas pareadas antes da primeira dose, mantendo reavaliação clínica a cada seis horas.',
    },
  },
};

export const ComImagem: Story = {
  args: {
    alternativa: {
      ...alternativa,
      texto: 'Padrão radiológico compatível com pneumotórax hipertensivo',
      imagem_url: 'https://picsum.photos/seed/alternativa/640/400',
    },
  },
};

export const ComImagemSemTexto: Story = {
  args: {
    alternativa: {
      ...alternativa,
      texto: '',
      imagem_url: 'https://picsum.photos/seed/alternativa-b/640/400',
    },
  },
};
