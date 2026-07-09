import type { Meta, StoryObj } from '@storybook/angular';

import { UiInfoTooltipComponent } from './ui-info-tooltip.component';

const meta: Meta<UiInfoTooltipComponent> = {
  title: 'Shared/UI/InfoTooltip',
  component: UiInfoTooltipComponent,
  tags: ['autodocs'],
  args: {
    text: 'Passe o mouse ou dê foco para ler esta explicação.',
    ariaLabel: 'Mais informações',
    size: 14,
  },
  render: (args) => ({
    props: args,
    // padding para o balão (que abre para baixo) ter espaço no canvas
    template: `<div style="padding: 0.5rem 0 6rem;"><app-ui-info-tooltip [text]="text" [ariaLabel]="ariaLabel" [size]="size" /></div>`,
  }),
};

export default meta;
type Story = StoryObj<UiInfoTooltipComponent>;

export const Padrao: Story = {};

export const InlineComTexto: Story = {
  args: {
    text: 'A Aurora é um apoio ao estudo, não a correção oficial.',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="display:flex; align-items:center; gap:0.375rem; padding: 0.5rem 0 6rem;">
        <span style="font-size:0.75rem; color: var(--color-text-muted);">IA corretora · BoraMed</span>
        <app-ui-info-tooltip [text]="text" [ariaLabel]="ariaLabel" [size]="size" />
      </div>`,
  }),
};

export const TextoLongo: Story = {
  args: {
    text: 'A Aurora é um apoio ao estudo, não a correção oficial. Ela indica a direção da resposta e os pontos principais para você treinar — não reproduz os critérios exatos dos professores da Afya. O BoraMed é uma plataforma independente, sem vínculo com a Afya.',
  },
};
