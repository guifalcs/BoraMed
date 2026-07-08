import type { Meta, StoryObj } from '@storybook/angular';
import { PeriodoFilterComponent } from './periodo-filter.component';

const meta: Meta<PeriodoFilterComponent> = {
  title: 'Shared/PeriodoFilter',
  component: PeriodoFilterComponent,
  tags: ['autodocs'],
  argTypes: {
    periodoChange: { action: 'periodoChange' },
  },
};

export default meta;
type Story = StoryObj<PeriodoFilterComponent>;

/** Preset padrão: 30 dias. */
export const Default: Story = {};

export const SeteDias: Story = {
  args: { presetInicial: '7d' },
};

export const NoventaDias: Story = {
  args: { presetInicial: '90d' },
};

/** Modo personalizado aberto: preencha as datas e clique em Aplicar.
 *  Data final anterior à inicial exibe erro de validação. */
export const Personalizado: Story = {
  args: { presetInicial: 'custom' },
};
