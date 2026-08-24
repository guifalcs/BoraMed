import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { UiCoroaPodioComponent } from './ui-coroa-podio.component';
import { UiMantoReiComponent } from './ui-manto-rei.component';

const meta: Meta<UiCoroaPodioComponent> = {
  title: 'UI/Coroa de pódio',
  component: UiCoroaPodioComponent,
  decorators: [moduleMetadata({ imports: [UiCoroaPodioComponent, UiMantoReiComponent] })],
  tags: ['autodocs'],
  argTypes: {
    posicao: { control: { type: 'inline-radio' }, options: [1, 2, 3] },
    size: { control: { type: 'range', min: 12, max: 96, step: 2 } },
  },
};

export default meta;
type Story = StoryObj<UiCoroaPodioComponent>;

export const Ouro: Story = {
  args: { posicao: 1, size: 18 },
};

export const Prata: Story = {
  args: { posicao: 2, size: 18 },
};

export const Bronze: Story = {
  args: { posicao: 3, size: 18 },
};

/** Os três metais no tamanho real da lista (18px) e ampliados. */
export const TodosOsMetais: Story = {
  render: () => ({
    template: `
      <div class="flex items-end gap-8 p-6">
        @for (p of [1, 2, 3]; track p) {
          <div class="flex flex-col items-center gap-3">
            <app-ui-coroa-podio [posicao]="p" [size]="64" />
            <app-ui-coroa-podio [posicao]="p" [size]="18" />
          </div>
        }
      </div>
    `,
  }),
};

/** Como aparece de fato na linha do ranking: coroa sobre o avatar, manto só no 1º. */
export const NaLinhaDoRanking: Story = {
  render: () => ({
    template: `
      <div class="w-96 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
        @for (p of [1, 2, 3, 4]; track p) {
          <div
            class="flex items-center gap-3 px-4"
            [class]="p === 1 ? 'py-3 bg-amber-50/70' : (p === 2 ? 'py-3 bg-slate-50' : (p === 3 ? 'py-3 bg-orange-50/60' : 'py-3 bg-white'))"
          >
            <span class="w-6 shrink-0 text-right text-xs font-bold text-slate-500">#{{ p }}</span>
            <div class="relative h-8 w-8 shrink-0">
              @if (p === 1) {
                <app-ui-manto-rei class="pointer-events-none absolute left-[calc(50%-22px)] top-[calc(50%-19px)] z-0" />
              }
              @if (p <= 3) {
                <app-ui-coroa-podio
                  class="pointer-events-none absolute -top-2.5 left-1/2 z-20 -translate-x-1/2"
                  [posicao]="p"
                  [size]="18"
                />
              }
              <div class="relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                M
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-slate-900">Participante {{ p }}</p>
              <p class="text-xs text-slate-500">Nível {{ 13 - p }}</p>
            </div>
            <span class="shrink-0 text-sm font-extrabold text-blue-800">{{ 1400 - p * 120 }} XP</span>
          </div>
        }
      </div>
    `,
  }),
};
