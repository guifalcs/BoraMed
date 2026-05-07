import type { Meta, StoryObj } from '@storybook/angular';

import { UiButtonComponent } from './ui-button.component';

const meta: Meta<UiButtonComponent> = {
  title: 'Shared/UI/Button',
  component: UiButtonComponent,
  tags: ['autodocs'],
  args: {
    label: 'Entrar',
    loadingLabel: 'Entrando...',
    variant: 'primary',
    loading: false,
    disabled: false,
    fullWidth: true,
    showArrow: true,
    type: 'button',
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'danger'],
    },
    type: {
      control: 'inline-radio',
      options: ['button', 'submit', 'reset'],
    },
  },
};

export default meta;
type Story = StoryObj<UiButtonComponent>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: {
    label: 'Voltar',
    variant: 'secondary',
    showArrow: false,
  },
};

export const Danger: Story = {
  args: {
    label: 'Excluir simulado',
    variant: 'danger',
    showArrow: false,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const Compact: Story = {
  args: {
    label: 'Finalizar',
    fullWidth: false,
    showArrow: false,
  },
};
