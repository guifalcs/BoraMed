import type { Meta, StoryObj } from '@storybook/angular';
import { FiltrosProvasComponent } from './filtros-provas.component';

const meta: Meta<FiltrosProvasComponent> = {
  title: 'Provas/FiltrosProvas',
  component: FiltrosProvasComponent,
  tags: ['autodocs'],
  args: {
    filtros: { subtipo: null, periodo: null },
  },
};

export default meta;
type Story = StoryObj<FiltrosProvasComponent>;

export const SemFiltros: Story = {};

export const SubtipoAtivo: Story = {
  args: { filtros: { subtipo: 'N1', periodo: null } },
};

export const TodosFiltros: Story = {
  args: { filtros: { subtipo: 'N2', periodo: 1 } },
};
