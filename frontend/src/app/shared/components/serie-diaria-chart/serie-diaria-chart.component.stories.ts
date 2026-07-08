import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { SerieDiariaChartComponent } from './serie-diaria-chart.component';

const meta: Meta<SerieDiariaChartComponent> = {
  title: 'Shared/SerieDiariaChart',
  component: SerieDiariaChartComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [provideCharts(withDefaultRegisterables())] }),
  ],
};

export default meta;
type Story = StoryObj<SerieDiariaChartComponent>;

const seteDias = [
  { dia: '2026-07-01', valor: 3 },
  { dia: '2026-07-02', valor: 0 },
  { dia: '2026-07-03', valor: 5 },
  { dia: '2026-07-04', valor: 2 },
  { dia: '2026-07-05', valor: 0 },
  { dia: '2026-07-06', valor: 7 },
  { dia: '2026-07-07', valor: 4 },
];

export const TentativasPorDia: Story = {
  args: {
    pontos: seteDias,
    label: 'Tentativas',
  },
};

export const XpPorDia: Story = {
  args: {
    pontos: seteDias.map((p) => ({ ...p, valor: p.valor * 45 })),
    label: 'XP',
    cor: '#f59e0b',
  },
};

/** Série existe mas todos os valores são zero: mostra o estado vazio. */
export const PeriodoSemAtividade: Story = {
  args: {
    pontos: seteDias.map((p) => ({ ...p, valor: 0 })),
    label: 'Tentativas',
    mensagemVazia: 'Nenhuma tentativa no período selecionado.',
  },
};

export const SemDados: Story = {
  args: {
    pontos: [],
    label: 'Tentativas',
  },
};
