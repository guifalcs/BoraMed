import type { Meta, StoryObj } from '@storybook/angular';
import { BookOpen } from 'lucide-angular';
import { EmptyStateComponent } from './empty-state.component';

const meta: Meta<EmptyStateComponent> = {
  title: 'Provas/EmptyState',
  component: EmptyStateComponent,
  tags: ['autodocs'],
  args: {
    titulo: 'Nenhuma prova encontrada',
    descricao: 'Estamos preparando o banco de provas. Em breve você terá acesso ao acervo completo.',
  },
};

export default meta;
type Story = StoryObj<EmptyStateComponent>;

export const Default: Story = {};

export const ComIcone: Story = {
  args: {
    icone: BookOpen,
  },
};

export const ComBotao: Story = {
  args: {
    icone: BookOpen,
    labelBotao: 'Limpar filtros',
  },
};

export const SemDescricao: Story = {
  args: {
    titulo: 'Sem resultados',
    descricao: null,
    labelBotao: 'Tentar novamente',
  },
};
