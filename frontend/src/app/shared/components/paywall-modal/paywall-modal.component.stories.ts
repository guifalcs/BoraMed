import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { PaywallModalComponent } from './paywall-modal.component';
import { PaywallService } from '../../../core/services/paywall.service';
import type { PaywallContexto } from '../../../core/models/paywall.types';

/** Serviço real, já aberto no contexto pedido (não tem dependências). */
function paywallAbertoEm(contexto: PaywallContexto) {
  const service = new PaywallService();
  service.abrir(contexto);
  return service;
}

function comContexto(contexto: PaywallContexto) {
  return moduleMetadata({
    providers: [{ provide: PaywallService, useFactory: () => paywallAbertoEm(contexto) }],
  });
}

const meta: Meta<PaywallModalComponent> = {
  title: 'Upsell/PaywallModal',
  component: PaywallModalComponent,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
};

export default meta;
type Story = StoryObj<PaywallModalComponent>;

/** Momento de maior intenção: o aluno acabou de esbarrar no teto. */
export const LimiteTentativas: Story = {
  decorators: [comContexto('limite-tentativas')],
};

export const Materiais: Story = {
  decorators: [comContexto('materiais')],
};

export const Flashcards: Story = {
  decorators: [comContexto('flashcards')],
};

export const SimuladoPersonalizado: Story = {
  decorators: [comContexto('simulado-personalizado')],
};

export const ProvaBloqueada: Story = {
  decorators: [comContexto('prova-bloqueada')],
};

export const Impressao: Story = {
  decorators: [comContexto('impressao')],
};

/** Fechado: o modal não renderiza nada. */
export const Fechado: Story = {
  decorators: [
    moduleMetadata({
      providers: [{ provide: PaywallService, useFactory: () => new PaywallService() }],
    }),
  ],
};
