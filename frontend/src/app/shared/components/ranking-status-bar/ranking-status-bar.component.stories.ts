import type { Meta, StoryObj } from '@storybook/angular';
import { RankingStatusBarComponent } from './ranking-status-bar.component';

const meta: Meta<RankingStatusBarComponent> = {
  title: 'Shared/RankingStatusBar',
  component: RankingStatusBarComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<RankingStatusBarComponent>;

export const ComPosicao: Story = {
  args: {
    posicaoGlobal: 47,
    posicaoSemana: 12,
    xpSemana: 230,
    competirPublico: true,
  },
};

export const Anonimo: Story = {
  args: {
    posicaoGlobal: 47,
    posicaoSemana: 12,
    xpSemana: 230,
    competirPublico: false,
  },
};

export const SemRanking: Story = {
  args: {
    posicaoGlobal: null,
    posicaoSemana: null,
    xpSemana: 0,
    competirPublico: true,
  },
};
