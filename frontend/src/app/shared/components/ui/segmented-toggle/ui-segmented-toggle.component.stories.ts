import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

import { UiSegmentedToggleComponent, SegmentedToggleOption } from './ui-segmented-toggle.component';

const CICLOS: SegmentedToggleOption[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'semestral', label: 'Semestral', badge: '-33%' },
];

const meta: Meta<UiSegmentedToggleComponent> = {
  title: 'Shared/UI/SegmentedToggle',
  component: UiSegmentedToggleComponent,
  decorators: [moduleMetadata({ imports: [UiSegmentedToggleComponent] })],
  tags: ['autodocs'],
  args: {
    options: CICLOS,
    value: 'mensal',
    ariaLabel: 'Ciclo de pagamento',
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<UiSegmentedToggleComponent>;

export const Default: Story = {};

export const SemestralSelecionado: Story = {
  args: {
    value: 'semestral',
  },
};

export const LabelsLongos: Story = {
  args: {
    options: [
      { value: 'mensal', label: 'Pagamento mensal' },
      { value: 'semestral', label: 'Pagamento semestral', badge: '-33%' },
    ],
    value: 'semestral',
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="width: 375px">
        <app-ui-segmented-toggle
          [options]="options"
          [value]="value"
          [ariaLabel]="ariaLabel"
          [disabled]="disabled"
        />
      </div>
    `,
  }),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
