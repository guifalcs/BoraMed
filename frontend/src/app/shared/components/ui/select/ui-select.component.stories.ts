import type { Meta, StoryObj } from '@storybook/angular';

import { UiSelectComponent, SelectOption } from './ui-select.component';

const PERIODOS: SelectOption<number>[] = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}º período`,
}));

const ESTADOS: SelectOption<string>[] = [
  { value: 'SP', label: 'São Paulo' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'PR', label: 'Paraná' },
  { value: 'BA', label: 'Bahia' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'GO', label: 'Goiás' },
];

const meta: Meta<UiSelectComponent> = {
  title: 'Shared/UI/Select',
  component: UiSelectComponent,
  tags: ['autodocs'],
  args: {
    label: 'Período',
    name: 'periodo',
    options: PERIODOS,
    value: null,
    placeholder: 'Selecione o período',
    error: null,
    helperText: null,
    required: false,
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<UiSelectComponent>;

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    value: 5,
  },
};

export const WithError: Story = {
  args: {
    error: 'Selecione um período válido.',
  },
};

export const WithHelperText: Story = {
  args: {
    helperText: 'Seu período atual no curso de medicina.',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: 3,
  },
};

export const ManyOptions: Story = {
  args: {
    label: 'Estado',
    name: 'estado',
    options: ESTADOS,
    placeholder: 'Selecione o estado',
    value: 'SP',
  },
};
