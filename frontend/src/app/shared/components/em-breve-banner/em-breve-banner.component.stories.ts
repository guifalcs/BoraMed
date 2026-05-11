import type { Meta, StoryObj } from '@storybook/angular';
import { Stethoscope, FlaskConical } from 'lucide-angular';
import { EmBreveBannerComponent } from './em-breve-banner.component';

const meta: Meta<EmBreveBannerComponent> = {
  title: 'Provas/EmBreveBanner',
  component: EmBreveBannerComponent,
  tags: ['autodocs'],
  args: {
    titulo: 'Provas Processuais',
    descricao: 'Estamos organizando o acervo de provas processuais da Rede Afya. Esta funcionalidade estará disponível em breve.',
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

export const Multiestacoes: Story = {
  args: {
    titulo: 'Provas Multiestações',
    descricao: 'Questões de laboratório com imagens de lâminas e peças anatômicas.',
    icone: FlaskConical,
  },
};

export const SemDescricao: Story = {
  args: {
    titulo: 'Outras Faculdades',
    descricao: null,
  },
};
