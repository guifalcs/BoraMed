import type { Meta, StoryObj } from '@storybook/angular';
import { MaterialCardComponent } from './material-card.component';
import type { MaterialCategoria } from '../../../core/models/material';

const categoriaBase: MaterialCategoria = {
  id: '1',
  slug: 'resumos-apg',
  titulo: 'Resumos de APGs',
  descricao: 'Materiais autorais no formato das sessões de Aprendizagem em Pequenos Grupos.',
  icone: 'BookOpen',
  gradiente: 'linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)',
  ordem: 0,
  ativo: true,
  criado_em: '2026-06-27T00:00:00Z',
};

const meta: Meta<MaterialCardComponent> = {
  title: 'Materiais/MaterialCard',
  component: MaterialCardComponent,
  tags: ['autodocs'],
  args: { categoria: categoriaBase },
};

export default meta;
type Story = StoryObj<MaterialCardComponent>;

export const Default: Story = {};

export const SemDescricao: Story = {
  args: { categoria: { ...categoriaBase, descricao: null } },
};

export const GradienteVerde: Story = {
  args: {
    categoria: {
      ...categoriaBase,
      titulo: 'Anatomia Aplicada',
      descricao: 'Mapas e resumos de anatomia sistêmica.',
      icone: 'Brain',
      gradiente: 'linear-gradient(145deg, #065f46 0%, #047857 48%, #059669 100%)',
    },
  },
};
