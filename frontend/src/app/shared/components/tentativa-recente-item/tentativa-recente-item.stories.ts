import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { TentativaRecenteItemComponent } from './tentativa-recente-item.component';

const dia = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const meta: Meta<TentativaRecenteItemComponent> = {
  title: 'Shared/TentativaRecenteItem',
  component: TentativaRecenteItemComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [provideRouter([])] }),
  ],
};

export default meta;
type Story = StoryObj<TentativaRecenteItemComponent>;

export const NotaAlta: Story = {
  args: {
    nomeProva: 'N1 – 2024/1',
    dataIso: dia(2),
    nota: 85,
    tentativaId: 'mock-t1',
    provaId: 'mock-1',
  },
};

export const NotaMedia: Story = {
  args: {
    nomeProva: 'Simulado Personalizado',
    dataIso: dia(5),
    nota: 60,
    tentativaId: 'mock-t2',
    provaId: 'mock-2',
  },
};

export const NotaBaixa: Story = {
  args: {
    nomeProva: 'N2 – 2023/2',
    dataIso: dia(12),
    nota: 45,
    tentativaId: 'mock-t3',
    provaId: 'mock-3',
  },
};

export const SemNota: Story = {
  args: {
    nomeProva: 'N1 – 2024/2',
    dataIso: dia(0),
    nota: null,
    tentativaId: 'mock-t4',
    provaId: 'mock-4',
  },
};
