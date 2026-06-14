import type { Meta, StoryObj } from '@storybook/angular';
import { QuestaoComentariosComponent } from './questao-comentarios.component';

const meta: Meta<QuestaoComentariosComponent> = {
  title: 'Comentarios/QuestaoComentarios',
  component: QuestaoComentariosComponent,
  tags: ['autodocs'],
  args: { questaoId: 'mock-questao-id-123' },
};

export default meta;
type Story = StoryObj<QuestaoComentariosComponent>;

export const Colapsado: Story = {};

export const ComQuestaoIdDiferente: Story = {
  args: { questaoId: 'outra-questao-id-456' },
};
