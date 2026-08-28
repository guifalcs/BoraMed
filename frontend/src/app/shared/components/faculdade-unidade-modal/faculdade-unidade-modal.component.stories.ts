import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import { FaculdadeUnidadeModalComponent } from './faculdade-unidade-modal.component';
import { ProfileService } from '../../../core/services/profile.service';

const meta: Meta<FaculdadeUnidadeModalComponent> = {
  title: 'Shared/FaculdadeUnidadeModal',
  component: FaculdadeUnidadeModalComponent,
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ProfileService,
          useValue: {
            precisaFaculdadeUnidade: signal(true),
            updateFaculdadeUnidade: () => Promise.resolve({ ok: true }),
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<FaculdadeUnidadeModalComponent>;

export const SemUnidade: Story = {};

export const ComUnidadePreenchida: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ProfileService,
          useValue: {
            precisaFaculdadeUnidade: signal(false),
            updateFaculdadeUnidade: () => Promise.resolve({ ok: true }),
          },
        },
      ],
    }),
  ],
};
