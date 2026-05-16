import type { Meta, StoryObj } from '@storybook/angular';
import { OnboardingTourComponent } from './onboarding-tour.component';
import type { IOnboardingFlow } from '../../../core/models/onboarding.types';

const flow: IOnboardingFlow = {
  key: 'dashboard_intro',
  version: 1,
  titulo: 'Conheça o BoraMed',
  subtitulo: 'Um giro rápido para achar o melhor treino.',
  steps: [
    {
      id: 'welcome',
      titulo: 'Seu treino no modelo Afya em um só lugar',
      descricao: 'Entenda onde começar, como acompanhar sua evolução e onde ajustar sua privacidade.',
      target: null,
      placement: 'center',
      ctaLabel: 'Conhecer o BoraMed',
    },
    {
      id: 'simulados',
      titulo: 'Monte o treino principal',
      descricao: 'Em Simulados você acessa treinos nacionais autorais e cria práticas por tema, período e quantidade de questões.',
      target: 'nav-simulados',
      placement: 'sidebar',
    },
    {
      id: 'final',
      titulo: 'Agora escolha seu primeiro treino',
      descricao: 'Abra Simulados e escolha o caminho que faz mais sentido para estudar agora.',
      target: null,
      placement: 'center',
      ctaLabel: 'Escolher treino',
    },
  ],
};

const meta: Meta<OnboardingTourComponent> = {
  title: 'Shared/OnboardingTour',
  component: OnboardingTourComponent,
  tags: ['autodocs'],
  args: {
    flow,
    activeStep: flow.steps[0],
    progressLabel: '1 de 3',
    canGoBack: false,
    isVisible: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="min-height: 620px; background: #f4f5f7; padding: 24px;">
        <aside style="width: 220px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; padding: 16px;">
          <div style="height: 44px; border-radius: 8px; background: #f1f5f9; margin-bottom: 12px;"></div>
          <button data-onboarding-target="nav-simulados" style="display: flex; width: 100%; border: 0; border-radius: 8px; background: #eff6ff; padding: 12px; color: #1e40af; font-weight: 700;">Simulados</button>
        </aside>
        <app-onboarding-tour
          [flow]="flow"
          [activeStep]="activeStep"
          [progressLabel]="progressLabel"
          [canGoBack]="canGoBack"
          [isVisible]="isVisible"
        />
      </div>
    `,
  }),
};

export default meta;
type Story = StoryObj<OnboardingTourComponent>;

export const Welcome: Story = {};

export const PopoverDesktop: Story = {
  args: {
    activeStep: flow.steps[1],
    progressLabel: '2 de 3',
    canGoBack: true,
  },
};

export const AlvoAusente: Story = {
  args: {
    activeStep: {
      ...flow.steps[1],
      target: 'alvo-inexistente',
    },
    progressLabel: '2 de 3',
    canGoBack: true,
  },
};

export const UltimoPasso: Story = {
  args: {
    activeStep: flow.steps[2],
    progressLabel: '3 de 3',
    canGoBack: true,
  },
};

export const TextoLongo: Story = {
  args: {
    activeStep: {
      ...flow.steps[1],
      titulo: 'Revise resultados, recomendações e próximos treinos sem perder o contexto',
      descricao: 'O texto pode crescer quando precisarmos explicar uma decisão importante do produto, então o cartão mantém largura estável e quebra linhas sem invadir botões ou esconder ações.',
    },
    progressLabel: '2 de 3',
    canGoBack: true,
  },
};

export const MobileBottomSheet: Story = {
  args: {
    activeStep: flow.steps[1],
    progressLabel: '2 de 3',
    canGoBack: true,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
