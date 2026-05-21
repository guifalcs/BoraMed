import type { Meta, StoryObj } from '@storybook/angular';
import { ImpersonationBannerComponent } from './impersonation-banner.component';

const meta: Meta<ImpersonationBannerComponent> = {
  title: 'UI/ImpersonationBanner',
  component: ImpersonationBannerComponent,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<ImpersonationBannerComponent>;

export const Default: Story = {
  args: { nomeUsuario: 'João da Silva', carregando: false },
};

export const LoadingVoltar: Story = {
  args: { nomeUsuario: 'João da Silva', carregando: true },
};

export const NomeLongo: Story = {
  args: { nomeUsuario: 'Bartholomeu Augusto de Albuquerque Cavalcanti', carregando: false },
};
