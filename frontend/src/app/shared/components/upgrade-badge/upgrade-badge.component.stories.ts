import type { Meta, StoryObj } from '@storybook/angular';
import { UpgradeBadgeComponent } from './upgrade-badge.component';

const meta: Meta<UpgradeBadgeComponent> = {
  title: 'Upsell/UpgradeBadge',
  component: UpgradeBadgeComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<UpgradeBadgeComponent>;

export const Default: Story = {};

export const Solido: Story = {
  args: { variante: 'solido' },
};

/** Variante para uso sobre o gradiente institucional (fundo escuro). */
export const Contorno: Story = {
  render: () => ({
    template: `
      <div style="background: var(--gradient-brand); padding: 1.5rem; border-radius: .75rem; display: inline-block">
        <app-upgrade-badge variante="contorno" />
      </div>
    `,
  }),
};

export const SemIcone: Story = {
  args: { comIcone: false },
};

export const LabelCustomizado: Story = {
  args: { label: 'Avançado' },
};
