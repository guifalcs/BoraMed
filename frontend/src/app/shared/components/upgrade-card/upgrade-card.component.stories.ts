import type { Meta, StoryObj } from '@storybook/angular';
import { UpgradeCardComponent } from './upgrade-card.component';

const meta: Meta<UpgradeCardComponent> = {
  title: 'Upsell/UpgradeCard',
  component: UpgradeCardComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<UpgradeCardComponent>;

export const Inline: Story = {};

export const Compacto: Story = {
  args: { variante: 'compacto' },
  render: (args) => ({
    props: args,
    template: `
      <div style="width: 220px">
        <app-upgrade-card
          [variante]="variante"
          [titulo]="titulo"
          [descricao]="descricao"
          [cta]="cta"
        />
      </div>
    `,
  }),
};

export const SemDescricao: Story = {
  args: { descricao: null },
};

/** Usado quando o aluno esgota as tentativas do plano gratuito. */
export const LimiteAtingido: Story = {
  args: {
    titulo: 'Seus simulados grátis acabaram',
    descricao: 'Seu histórico continua salvo. Assine para retomar de onde parou.',
    cta: 'Assinar agora',
    origem: 'limite-tentativas',
  },
};
