import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { DataTableComponent, type DataTableColumn } from './data-table.component';
import { DataTableColumnDirective } from './data-table-column.directive';

interface DemoRow {
  nome: string;
  data: string;
  modo: string;
  nota: number;
}

const columns: DataTableColumn[] = [
  { key: 'nome', header: 'Prova', sortable: true },
  { key: 'data', header: 'Data', sortable: true },
  { key: 'modo', header: 'Modo', sortable: true },
  { key: 'nota', header: 'Nota (%)', sortable: true },
];

const generateData = (count: number): DemoRow[] =>
  Array.from({ length: count }, (_, i) => ({
    nome: `Simulado N${(i % 3) + 1} — ${(i % 4) + 1}º Período — Edição ${Math.floor(i / 3) + 1}`,
    data: new Date(2025, 0, 1 + i).toLocaleDateString('pt-BR'),
    modo: i % 2 === 0 ? 'Simulado' : 'Estudo',
    nota: Math.round(40 + Math.random() * 60),
  }));

const meta: Meta<DataTableComponent<DemoRow>> = {
  title: 'Shared/DataTable',
  component: DataTableComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [DataTableColumnDirective],
    }),
  ],
  args: {
    columns,
    data: generateData(5),
    filterable: false,
    paginated: false,
    pageSize: 10,
    clickable: false,
  },
};

export default meta;
type Story = StoryObj<DataTableComponent<DemoRow>>;

export const Default: Story = {};

export const WithFilter: Story = {
  args: {
    filterable: true,
    filterPlaceholder: 'Buscar por nome, modo...',
    data: generateData(12),
  },
};

export const WithPagination: Story = {
  args: {
    paginated: true,
    pageSize: 5,
    data: generateData(23),
  },
};

export const FullFeatured: Story = {
  args: {
    filterable: true,
    paginated: true,
    pageSize: 5,
    clickable: true,
    data: generateData(30),
    filterPlaceholder: 'Buscar...',
  },
};

export const Empty: Story = {
  args: {
    data: [],
  },
};

export const FewRows: Story = {
  args: {
    data: generateData(3),
    paginated: true,
    pageSize: 10,
  },
};
