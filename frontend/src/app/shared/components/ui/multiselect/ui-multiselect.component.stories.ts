import type { Meta, StoryObj } from '@storybook/angular';
import { UiMultiselectComponent } from './ui-multiselect.component';

const periodoOpcoes = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}º período`,
}));

const anoOpcoes = Array.from({ length: 6 }, (_, i) => ({
  value: 2024 - i,
  label: String(2024 - i),
}));

const tipoOpcoes = [
  { value: 'N1', label: 'N1' },
  { value: 'N2', label: 'N2' },
  { value: 'teste_progresso', label: 'TPI' },
  { value: 'integradora', label: 'Integradora' },
];

const materiaOpcoes = [
  { value: 'soi-1', label: 'SOI I', group: '1º período' },
  { value: 'ham-1', label: 'HAM I', group: '1º período' },
  { value: 'iesc-1', label: 'IESC I', group: '1º período' },
  { value: 'mcm-1', label: 'MCM I', group: '1º período' },
  { value: 'soi-2', label: 'SOI II', group: '2º período' },
  { value: 'ham-2', label: 'HAM II', group: '2º período' },
  { value: 'iesc-2', label: 'IESC II', group: '2º período' },
  { value: 'mcm-2', label: 'MCM II', group: '2º período' },
];

const meta: Meta<UiMultiselectComponent> = {
  title: 'UI/Multiselect',
  component: UiMultiselectComponent,
  args: {
    label: 'Tipo',
    name: 'tipo',
    options: tipoOpcoes,
    values: [],
    placeholder: 'Todos',
  },
};

export default meta;
type Story = StoryObj<UiMultiselectComponent>;

export const Vazio: Story = {};

export const UmSelecionado: Story = {
  args: {
    values: ['N1'],
  },
};

export const MultiplosSelecionados: Story = {
  args: {
    label: 'Tipo',
    values: ['N1', 'N2'],
  },
};

export const TodosSelecionados: Story = {
  args: {
    values: ['N1', 'teste_progresso', 'N2'],
  },
};

export const ComAnos: Story = {
  args: {
    label: 'Ano',
    name: 'ano',
    options: anoOpcoes,
    values: [2024, 2023],
    placeholder: 'Todos',
  },
};

export const ComPeriodos: Story = {
  args: {
    label: 'Período',
    name: 'periodo',
    options: periodoOpcoes,
    values: [1, 2, 3],
    placeholder: 'Todos',
  },
};

export const ComGrupos: Story = {
  args: {
    label: 'Matéria',
    name: 'materia',
    options: materiaOpcoes,
    values: ['soi-1'],
    placeholder: 'Todas',
  },
};

export const Desabilitado: Story = {
  args: {
    disabled: true,
    values: ['N1'],
  },
};

export const ComErro: Story = {
  args: {
    error: 'Selecione pelo menos uma opção',
  },
};
