import type { Meta, StoryObj } from '@storybook/angular';
import { EvolucaoNotaChartComponent } from './evolucao-nota-chart.component';

const meta: Meta<EvolucaoNotaChartComponent> = {
  title: 'Shared/EvolucaoNotaChart',
  component: EvolucaoNotaChartComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<EvolucaoNotaChartComponent>;

export const Evolucao: Story = {
  args: {
    pontos: [
      { data: '2026-04-01T10:00:00Z', nota: 45 },
      { data: '2026-04-08T10:00:00Z', nota: 52 },
      { data: '2026-04-15T10:00:00Z', nota: 48 },
      { data: '2026-04-22T10:00:00Z', nota: 61 },
      { data: '2026-04-29T10:00:00Z', nota: 58 },
      { data: '2026-05-06T10:00:00Z', nota: 72 },
      { data: '2026-05-13T10:00:00Z', nota: 78 },
    ],
  },
};

export const UmPonto: Story = {
  args: {
    pontos: [
      { data: '2026-05-10T10:00:00Z', nota: 65 },
    ],
  },
};

export const DoisPontos: Story = {
  args: {
    pontos: [
      { data: '2026-05-01T10:00:00Z', nota: 40 },
      { data: '2026-05-14T10:00:00Z', nota: 75 },
    ],
  },
};

export const SemDados: Story = {
  args: {
    pontos: [],
  },
};

export const NotasBaixas: Story = {
  args: {
    pontos: [
      { data: '2026-04-01T10:00:00Z', nota: 20 },
      { data: '2026-04-10T10:00:00Z', nota: 30 },
      { data: '2026-04-20T10:00:00Z', nota: 25 },
      { data: '2026-05-01T10:00:00Z', nota: 35 },
    ],
  },
};
