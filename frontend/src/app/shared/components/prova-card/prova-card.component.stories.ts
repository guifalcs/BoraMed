import type { Meta, StoryObj } from '@storybook/angular';
import { ProvaCardComponent } from './prova-card.component';
import type { Prova } from '../../../core/models/prova';

const prova: Prova = {
  id: 'prova-1',
  faculdade_id: 'fac-1',
  nome: 'Prova Nacional Afya — 1º Período',
  periodo: 1,
  ano: 2024,
  semestre: 1,
  tipo: 'nacional',
  subtipo_nacional: 'N1',
  qtd_questoes: 30,
  tempo_sugerido_minutos: 60,
  criado_em: '2024-01-01T00:00:00Z',
};

const meta: Meta<ProvaCardComponent> = {
  title: 'Provas/ProvaCard',
  component: ProvaCardComponent,
  tags: ['autodocs'],
  args: { prova, destacar: false },
};

export default meta;
type Story = StoryObj<ProvaCardComponent>;

export const Default: Story = {};

export const Destacado: Story = { args: { destacar: true } };

export const TesteProgresso: Story = {
  args: { prova: { ...prova, subtipo_nacional: 'teste_progresso', qtd_questoes: 20, tempo_sugerido_minutos: null } },
};

export const N2: Story = {
  args: { prova: { ...prova, subtipo_nacional: 'N2', nome: 'Prova N2 — Integradora' } },
};

export const SemTempo: Story = {
  args: { prova: { ...prova, tempo_sugerido_minutos: null } },
};
