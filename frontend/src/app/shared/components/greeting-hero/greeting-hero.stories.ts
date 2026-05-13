import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { GreetingHeroComponent } from './greeting-hero.component';

const meta: Meta<GreetingHeroComponent> = {
  title: 'Shared/GreetingHero',
  component: GreetingHeroComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [provideRouter([])] }),
  ],
};

export default meta;
type Story = StoryObj<GreetingHeroComponent>;

export const ComPeriodoSemTentativa: Story = {
  args: {
    nomeCompleto: 'Arthur Barata',
    periodo: 3,
    temTentativaAtiva: false,
    rotaCta: ['/dashboard/simulados'],
  },
};

export const ComTentativaAtiva: Story = {
  args: {
    nomeCompleto: 'Arthur Barata',
    periodo: 3,
    temTentativaAtiva: true,
    rotaCta: ['/dashboard/simulados', 'prova-1', 'tentativa', 'tentativa-1'],
  },
};

export const SemPeriodo: Story = {
  args: {
    nomeCompleto: 'Maria Oliveira',
    periodo: null,
    temTentativaAtiva: false,
    rotaCta: ['/dashboard/simulados'],
  },
};

export const SemNome: Story = {
  args: {
    nomeCompleto: null,
    periodo: 1,
    temTentativaAtiva: false,
    rotaCta: ['/dashboard/simulados'],
  },
};
