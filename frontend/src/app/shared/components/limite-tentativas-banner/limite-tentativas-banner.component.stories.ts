import type { Meta, StoryObj } from '@storybook/angular';
import { LimiteTentativasBannerComponent } from './limite-tentativas-banner.component';

const meta: Meta<LimiteTentativasBannerComponent> = {
  title: 'Upsell/LimiteTentativasBanner',
  component: LimiteTentativasBannerComponent,
  tags: ['autodocs'],
  args: { restantes: 3, limite: 3 },
};

export default meta;
type Story = StoryObj<LimiteTentativasBannerComponent>;

/** Estado inicial: nenhuma tentativa usada, tom neutro. */
export const Intacto: Story = {};

export const UmaUsada: Story = {
  args: { restantes: 2 },
};

/** Vira âmbar na última tentativa, antes do bloqueio acontecer. */
export const UltimaTentativa: Story = {
  args: { restantes: 1 },
};

/** Esgotado: tom crítico e CTA de assinatura. */
export const Esgotado: Story = {
  args: { restantes: 0 },
};

/** Sem CTA, para uso dentro de um bloco que já tem o seu. */
export const SemCta: Story = {
  args: { restantes: 1, comCta: false },
};
