import type { Meta, StoryObj } from '@storybook/angular';
import { UiSpinnerComponent } from './ui-spinner.component';

const meta: Meta<UiSpinnerComponent> = {
  title: 'Shared/UI/Spinner',
  component: UiSpinnerComponent,
  tags: ['autodocs'],
  args: {
    size: 'md',
    label: '',
    centered: true,
  },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<UiSpinnerComponent>;

export const Default: Story = {};

export const ComLabel: Story = {
  args: { label: 'Carregando prova...' },
};

export const Grande: Story = {
  args: { size: 'lg', label: 'Preparando seu simulado...' },
};

export const Inline: Story = {
  args: { size: 'sm', centered: false },
};
