import type { Meta, StoryObj } from '@storybook/angular';
import { ProvaCardComponent } from './prova-card.component';
import type { Prova } from '../../../core/models/prova';

const prova: Prova = {
  id: 'prova-1',
  faculdade_id: null,
  nome: 'Simulado N1 — 1º Período — Edição 1',
  periodo: 1,
  ano: null,
  semestre: null,
  tipo: 'autoral',
  origem: 'autoral',
  formato: 'nacional',
  rede: 'afya',
  subtipo: 'N1',
  subtipo_nacional: 'N1',
  publicada: true,
  arquivada: false,
  qtd_questoes: 30,
  tempo_sugerido_minutos: 60,
  edicao: 1,
  criado_em: '2024-01-01T00:00:00Z',
};

const meta: Meta<ProvaCardComponent> = {
  title: 'Provas/ProvaCard',
  component: ProvaCardComponent,
  tags: ['autodocs'],
  args: { prova },
};

export default meta;
type Story = StoryObj<ProvaCardComponent>;

export const Default: Story = {};

export const RowVariant: Story = { args: { variant: 'row' } };

export const TesteProgresso: Story = {
  args: { prova: { ...prova, subtipo_nacional: 'teste_progresso', qtd_questoes: 20, tempo_sugerido_minutos: null } },
};

export const N2: Story = {
  args: { prova: { ...prova, subtipo_nacional: 'N2', nome: 'Simulado N2 — Integradora — Edição 1' } },
};

export const SemTempo: Story = {
  args: { prova: { ...prova, tempo_sugerido_minutos: null } },
};
