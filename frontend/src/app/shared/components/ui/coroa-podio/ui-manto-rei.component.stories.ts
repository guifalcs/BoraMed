import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { UiMantoReiComponent } from './ui-manto-rei.component';
import { UiCoroaPodioComponent } from './ui-coroa-podio.component';

const meta: Meta<UiMantoReiComponent> = {
  title: 'UI/Manto de rei',
  component: UiMantoReiComponent,
  decorators: [moduleMetadata({ imports: [UiMantoReiComponent, UiCoroaPodioComponent] })],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<UiMantoReiComponent>;

export const Sozinho: Story = {};

/** O manto só faz sentido montado: sobe atrás de um avatar de 32px. */
export const SobAvatar: Story = {
  render: () => ({
    template: `
      <div class="flex items-center gap-12 p-8">
        <div class="relative h-8 w-8">
          <app-ui-manto-rei class="pointer-events-none absolute left-[calc(50%-22px)] top-[calc(50%-19px)] z-0" />
          <app-ui-coroa-podio
            class="pointer-events-none absolute -top-2.5 left-1/2 z-20 -translate-x-1/2"
            [posicao]="1"
            [size]="18"
          />
          <div class="relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-bold text-blue-700 ring-2 ring-amber-400">
            M
          </div>
        </div>

        <div class="origin-left scale-[3]">
          <div class="relative h-8 w-8">
            <app-ui-manto-rei class="pointer-events-none absolute left-[calc(50%-22px)] top-[calc(50%-19px)] z-0" />
            <app-ui-coroa-podio
              class="pointer-events-none absolute -top-2.5 left-1/2 z-20 -translate-x-1/2"
              [posicao]="1"
              [size]="18"
            />
            <div class="relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-bold text-blue-700 ring-2 ring-amber-400">
              M
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};
