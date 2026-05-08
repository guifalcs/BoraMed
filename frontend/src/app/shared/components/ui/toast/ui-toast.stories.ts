import type { Meta, StoryObj } from '@storybook/angular';
import { UiToastComponent } from './ui-toast.component';

const meta: Meta<UiToastComponent> = {
  title: 'Shared/UI/Toast',
  component: UiToastComponent,
  tags: ['autodocs'],
  args: {
    type: 'success',
    message: 'Ação realizada com sucesso.',
  },
  argTypes: {
    type: {
      control: 'inline-radio',
      options: ['success', 'warning', 'error'],
    },
  },
};

export default meta;
type Story = StoryObj<UiToastComponent>;

export const Success: Story = {
  args: {
    type: 'success',
    message: 'Login realizado com sucesso.',
  },
};

export const Warning: Story = {
  args: {
    type: 'warning',
    message: 'Sua sessão expira em 5 minutos.',
  },
};

export const Error: Story = {
  args: {
    type: 'error',
    message: 'Não foi possível salvar as alterações. Tente novamente.',
  },
};

export const LongMessage: Story = {
  args: {
    type: 'success',
    message: 'Conta criada! Verifique seu e-mail para ativar o acesso ao BoraMed.',
  },
};
