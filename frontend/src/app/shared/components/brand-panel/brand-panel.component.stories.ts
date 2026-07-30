import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { BrandPanelComponent } from './brand-panel.component';

const meta: Meta<BrandPanelComponent> = {
  title: 'Auth/BrandPanel',
  component: BrandPanelComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [provideRouter([])] }),
  ],
};

export default meta;
type Story = StoryObj<BrandPanelComponent>;

export const Login: Story = {
  args: {
    kicker: 'Foco inicial em alunos da rede Afya',
    titulo: 'Treine com questões autorais no <em>modelo da sua prova.</em>',
    descricao: 'Simulados independentes no estilo das avaliações nacionais, processuais e de laboratório. Os treinos processuais e de laboratório cobrem, por enquanto, o conteúdo do primeiro período.',
    showMetrics: true,
  },
};

export const Cadastro: Story = {
  args: {
    kicker: 'Seu plano de revisão começa aqui',
    titulo: 'Monte simulados por tema, formato e <em>período.</em>',
    descricao: 'Organize sua preparação com questões autorais, alinhadas ao calendário e ao estilo das avaliações que você enfrenta.',
    showMetrics: false,
  },
};
