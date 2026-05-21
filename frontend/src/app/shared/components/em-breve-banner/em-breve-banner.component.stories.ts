import type { Meta, StoryObj } from '@storybook/angular';
import { Stethoscope, FlaskConical } from 'lucide-angular';
import { EmBreveBannerComponent } from './em-breve-banner.component';

const meta: Meta<EmBreveBannerComponent> = {
  title: 'Provas/EmBreveBanner',
  component: EmBreveBannerComponent,
  tags: ['autodocs'],
  args: {
    titulo: 'Treinos Processuais',
    descricao: 'Estamos preparando questões autorais no modelo das avaliações processuais. Esta funcionalidade estará disponível em breve.',
  },
};

export default meta;
type Story = StoryObj<EmBreveBannerComponent>;

export const Default: Story = {};

export const ComIcone: Story = {
  args: {
    icone: Stethoscope,
  },
};

export const Laboratorio: Story = {
  args: {
    titulo: 'Treinos de Laboratório',
    descricao: 'Questões autorais de laboratório com imagens de lâminas e peças anatômicas.',
    icone: FlaskConical,
  },
};

export const SemDescricao: Story = {
  args: {
    titulo: 'Outras Faculdades',
    descricao: null,
  },
};
