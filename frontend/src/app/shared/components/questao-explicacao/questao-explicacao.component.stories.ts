import type { Meta, StoryObj } from '@storybook/angular';
import { QuestaoExplicacaoComponent } from './questao-explicacao.component';

const meta: Meta<QuestaoExplicacaoComponent> = {
  title: 'Provas/QuestaoExplicacao',
  component: QuestaoExplicacaoComponent,
  tags: ['autodocs'],
  args: {
    explicacao:
      'A resposta correta é a letra B. O choque anafilático requer tratamento imediato com adrenalina intramuscular na dose de 0,3–0,5mg no músculo vasto lateral da coxa.',
    visivel: true,
  },
};

export default meta;
type Story = StoryObj<QuestaoExplicacaoComponent>;

export const Visivel: Story = {};

export const ComReferencia: Story = {
  args: {
    referencia: 'Guia Médico Afya, 1º período, p. 142.',
  },
};

export const Oculta: Story = {
  args: {
    visivel: false,
  },
};
