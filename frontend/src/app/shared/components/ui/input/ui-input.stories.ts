import type { Meta, StoryObj } from '@storybook/angular';

import { UiInputComponent } from './ui-input.component';

const meta: Meta<UiInputComponent> = {
  title: 'Shared/UI/Input',
  component: UiInputComponent,
  tags: ['autodocs'],
  args: {
    label: 'E-mail',
    name: 'email',
    value: 'arthur@afya.edu.br',
    type: 'email',
    autocomplete: 'email',
    placeholder: '',
    error: null,
    helperText: null,
    labelActionText: null,
    labelActionRouterLink: null,
    showPasswordToggle: false,
    showStrength: false,
    required: false,
  },
  argTypes: {
    type: {
      control: 'inline-radio',
      options: ['text', 'email', 'password'],
    },
  },
};

export default meta;
type Story = StoryObj<UiInputComponent>;

export const Email: Story = {};

export const WithError: Story = {
  args: {
    error: 'E-mail inválido.',
  },
};

export const Password: Story = {
  args: {
    label: 'Senha',
    name: 'password',
    value: 'boramed',
    type: 'password',
    autocomplete: 'current-password',
    labelActionText: 'Esqueci a senha',
    labelActionRouterLink: '/recuperar-senha',
    showPasswordToggle: true,
  },
};

export const PasswordStrength: Story = {
  args: {
    label: 'Senha',
    name: 'newPassword',
    value: 'Afya2026!',
    type: 'password',
    autocomplete: 'new-password',
    showPasswordToggle: true,
    showStrength: true,
  },
};

export const HelperText: Story = {
  args: {
    label: 'Nome completo',
    name: 'fullName',
    value: 'Arthur Guilherme',
    type: 'text',
    autocomplete: 'name',
    helperText: 'Use o nome como aparece no cadastro acadêmico.',
  },
};
