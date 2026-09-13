import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import { DadosObrigatoriosModalComponent } from './dados-obrigatorios-modal.component';
import { ProfileService } from '../../../core/services/profile.service';

const profileServiceFake = (opts: { unidade: boolean; periodo: boolean }) => ({
  provide: ProfileService,
  useValue: {
    precisaDadosObrigatorios: signal(opts.unidade || opts.periodo),
    faltaFaculdadeUnidade: signal(opts.unidade),
    faltaPeriodo: signal(opts.periodo),
    updateDadosObrigatorios: () => Promise.resolve({ ok: true }),
  },
});

const meta: Meta<DadosObrigatoriosModalComponent> = {
  title: 'Shared/DadosObrigatoriosModal',
  component: DadosObrigatoriosModalComponent,
  decorators: [
    moduleMetadata({ providers: [profileServiceFake({ unidade: true, periodo: true })] }),
  ],
};

export default meta;
type Story = StoryObj<DadosObrigatoriosModalComponent>;

export const SemUnidadeESemPeriodo: Story = {};

export const SoFaltaUnidade: Story = {
  decorators: [
    moduleMetadata({ providers: [profileServiceFake({ unidade: true, periodo: false })] }),
  ],
};

export const SoFaltaPeriodo: Story = {
  decorators: [
    moduleMetadata({ providers: [profileServiceFake({ unidade: false, periodo: true })] }),
  ],
};

export const PerfilCompleto: Story = {
  decorators: [
    moduleMetadata({ providers: [profileServiceFake({ unidade: false, periodo: false })] }),
  ],
};
