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
    kicker: 'Para alunos da rede Afya',
    titulo: 'Treine com questões feitas pra <em>sua prova.</em>',
    descricao: 'Simulados originais no padrão das avaliações nacionais, processuais (N1/N2) e laboratório (P1/P2). Estude exatamente o que cai.',
    showMetrics: true,
  },
};

export const Cadastro: Story = {
  args: {
    kicker: 'Seu plano de revisão começa aqui',
    titulo: 'Monte simulados por tema, formato e <em>período.</em>',
    descricao: 'Organize sua preparação com questões originais alinhadas ao calendário da rede Afya.',
    showMetrics: false,
  },
};
