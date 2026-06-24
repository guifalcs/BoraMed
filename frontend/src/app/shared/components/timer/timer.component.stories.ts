import type { Meta, StoryObj } from '@storybook/angular';
import { TimerComponent } from './timer.component';

const meta: Meta<TimerComponent> = {
  title: 'Provas/Timer',
  component: TimerComponent,
  tags: ['autodocs'],
  args: { seconds: 1800, countdown: true, warnAt: 300, dangerAt: 60 },
};

export default meta;
type Story = StoryObj<TimerComponent>;

/** Contagem crescente (default das provas): sempre neutro, sem cor de alerta. */
export const Crescente: Story = { args: { seconds: 45, countdown: false } };

export const Normal: Story = { args: { seconds: 1800 } };

export const Warning: Story = { args: { seconds: 240 } };

export const Danger: Story = { args: { seconds: 45 } };

export const Zero: Story = { args: { seconds: 0 } };

export const ComHoras: Story = { args: { seconds: 3661 } };
