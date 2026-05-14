import type { Meta, StoryObj } from '@storybook/angular';
import { TrendingUp, CheckCircle2, AlertTriangle, Award } from 'lucide-angular';
import { KpiCardComponent } from './kpi-card.component';

const meta: Meta<KpiCardComponent> = {
  title: 'Shared/KpiCard',
  component: KpiCardComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<KpiCardComponent>;

export const Default: Story = {
  args: {
    label: '% Acerto Geral',
    valor: '72%',
    sublabel: 'todas as tentativas',
    icone: TrendingUp,
    variante: 'default',
  },
};

export const Success: Story = {
  args: {
    label: 'Simulados Concluídos',
    valor: '14',
    sublabel: '+2 nesta semana',
    icone: CheckCircle2,
    variante: 'success',
  },
};

export const Warning: Story = {
  args: {
    label: '% Acerto Geral',
    valor: '58%',
    sublabel: 'todas as tentativas',
    icone: TrendingUp,
    variante: 'warning',
  },
};

export const Danger: Story = {
  args: {
    label: 'Tema Mais Fraco',
    valor: 'Bioquímica',
    sublabel: '38% de acerto',
    icone: AlertTriangle,
    variante: 'danger',
  },
};

export const SemSublabel: Story = {
  args: {
    label: 'Última Nota',
    valor: '85%',
    sublabel: null,
    icone: Award,
    variante: 'success',
  },
};

export const ComSparkline: Story = {
  args: {
    label: 'Última Nota',
    valor: '78%',
    sublabel: 'tendência de alta',
    icone: Award,
    variante: 'success',
    sparkline: [45, 52, 48, 61, 58, 72, 78],
  },
};

export const SparklineQueda: Story = {
  args: {
    label: 'Última Nota',
    valor: '42%',
    sublabel: 'tendência de queda',
    icone: TrendingUp,
    variante: 'danger',
    sparkline: [70, 65, 58, 50, 42],
  },
};
