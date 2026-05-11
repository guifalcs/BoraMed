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
