import type { Meta, StoryObj } from '@storybook/angular';
import { SuporteWidgetComponent } from './suporte-widget.component';

const meta: Meta<SuporteWidgetComponent> = {
  title: 'Shared/SuporteWidget',
  component: SuporteWidgetComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Widget flutuante de suporte. Abre um drawer com abas: Nova solicitação, Minhas solicitações, FAQ.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<SuporteWidgetComponent>;

export const Default: Story = {};
