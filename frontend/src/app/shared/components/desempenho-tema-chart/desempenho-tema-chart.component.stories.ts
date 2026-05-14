import type { Meta, StoryObj } from '@storybook/angular';
import { DesempenhoTemaChartComponent } from './desempenho-tema-chart.component';

const meta: Meta<DesempenhoTemaChartComponent> = {
  title: 'Shared/DesempenhoTemaChart',
  component: DesempenhoTemaChartComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<DesempenhoTemaChartComponent>;

export const ComDados: Story = {
  args: {
    temas: [
      { tema_nome: 'Bioquímica',       total: 20, acertos: 8,  taxa: 40 },
      { tema_nome: 'Farmacologia',     total: 15, acertos: 9,  taxa: 60 },
      { tema_nome: 'Fisiologia',       total: 25, acertos: 18, taxa: 72 },
      { tema_nome: 'Anatomia',         total: 18, acertos: 14, taxa: 78 },
      { tema_nome: 'Microbiologia',    total: 10, acertos: 9,  taxa: 90 },
    ],
  },
};

export const SemDados: Story = {
  args: {
    temas: [],
  },
};

export const ApenasUmTema: Story = {
  args: {
    temas: [
      { tema_nome: 'Patologia', total: 5, acertos: 2, taxa: 40 },
    ],
  },
};
