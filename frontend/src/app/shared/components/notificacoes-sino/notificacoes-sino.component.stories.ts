import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal, computed } from '@angular/core';
import { NotificacoesSinoComponent } from './notificacoes-sino.component';
import { AppNotificacaoService } from '../../../core/services/app-notification.service';

const notifBase = {
  id: '1',
  user_id: 'u1',
  tipo: 'sistema' as const,
  titulo: 'Bem-vindo ao BoraMed!',
  mensagem: 'Complete seu perfil para aproveitar ao máximo.',
  lida: false,
  lida_em: null as string | null,
  dados: null,
  criado_em: new Date().toISOString(),
};

function makeService(notifs: typeof notifBase[]) {
  const _notificacoes = signal(notifs);
  return {
    notificacoes: _notificacoes.asReadonly(),
    naoLidas: computed(() => _notificacoes().filter(n => !n.lida).length),
    carregar: () => Promise.resolve(),
    marcarLida: () => Promise.resolve(),
    marcarTodasLidas: () => Promise.resolve(),
  };
}

const meta: Meta<NotificacoesSinoComponent> = {
  title: 'Shared/NotificacoesSino',
  component: NotificacoesSinoComponent,
};

export default meta;
type Story = StoryObj<NotificacoesSinoComponent>;

export const ComNaoLidas: Story = {
  decorators: [
    moduleMetadata({
      providers: [{ provide: AppNotificacaoService, useValue: makeService([notifBase, { ...notifBase, id: '2', titulo: 'Nova conquista desbloqueada!', lida: false }]) }],
    }),
  ],
};

export const TodasLidas: Story = {
  decorators: [
    moduleMetadata({
      providers: [{ provide: AppNotificacaoService, useValue: makeService([{ ...notifBase, lida: true, lida_em: new Date().toISOString() }]) }],
    }),
  ],
};

export const Vazia: Story = {
  decorators: [
    moduleMetadata({
      providers: [{ provide: AppNotificacaoService, useValue: makeService([]) }],
    }),
  ],
};
