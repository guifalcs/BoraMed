import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { signal } from '@angular/core';
import { UiToastsContainerComponent } from './ui-toasts-container.component';
import { NotificationService } from '../../../../core/services/notification.service';

function mockService(notifications: { id: string; type: 'success' | 'warning' | 'error'; message: string }[]) {
  return {
    notifications: signal(notifications),
    dismiss: () => {},
    success: () => {},
    warning: () => {},
    error: () => {},
  } as unknown as NotificationService;
}

const meta: Meta<UiToastsContainerComponent> = {
  title: 'Shared/UI/Toast Container',
  component: UiToastsContainerComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<UiToastsContainerComponent>;

export const AllVariants: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: NotificationService,
          useValue: mockService([
            { id: '1', type: 'success', message: 'Login realizado com sucesso.' },
            { id: '2', type: 'warning', message: 'Sua sessão expira em 5 minutos.' },
            { id: '3', type: 'error', message: 'Não foi possível carregar as questões.' },
          ]),
        },
      ],
    }),
  ],
};

export const SuccessOnly: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: NotificationService,
          useValue: mockService([
            { id: '1', type: 'success', message: 'Simulado criado com sucesso.' },
          ]),
        },
      ],
    }),
  ],
};

export const Empty: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: NotificationService,
          useValue: mockService([]),
        },
      ],
    }),
  ],
};
