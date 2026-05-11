import type { Meta, StoryObj } from '@storybook/angular';
import { ModoSelectorComponent } from './modo-selector.component';

const meta: Meta<ModoSelectorComponent> = {
  title: 'Provas/ModoSelector',
  component: ModoSelectorComponent,
  tags: ['autodocs'],
  args: { modo: 'simulado' },
  argTypes: {
    modo: { control: 'inline-radio', options: ['simulado', 'estudo', 'visualizar'] },
  },
};

export default meta;
type Story = StoryObj<ModoSelectorComponent>;

export const Simulado: Story = {};

export const Estudo: Story = { args: { modo: 'estudo' } };

export const Visualizar: Story = { args: { modo: 'visualizar' } };
