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

/** Com os dois baldes informados, a descrição diz o que ainda dá para fazer. */
export const PorBalde: Story = {
  args: { restantes: 3, nacionalRestantes: 2, montadoRestantes: 1 },
};

/** Gastou o simulado montado: sobra só treino pronto. */
export const SoNacional: Story = {
  args: { restantes: 2, nacionalRestantes: 2, montadoRestantes: 0 },
};

/** Gastou os dois treinos prontos: sobra só a bala de prata do montado. */
export const SoMontado: Story = {
  args: { restantes: 1, nacionalRestantes: 0, montadoRestantes: 1 },
};
