import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { ResultadoSummaryComponent } from './resultado-summary.component';
import type { ResultadoTentativa } from '../../../core/models/tentativa';

const temas = [
  { id: 't1', nome: 'Anatomia Cardiovascular', disciplina: 'SOI', periodo: 1, parent_id: null, criado_em: '' },
  { id: 't2', nome: 'Fisiologia Renal', disciplina: 'SOI', periodo: 1, parent_id: null, criado_em: '' },
];

const tentativaBase = {
  id: 'tent-1',
  user_id: 'user-1',
  prova_id: 'prova-1',
  modo: 'simulado' as const,
  status: 'finalizada' as const,
  total_questoes: 30,
  total_respondidas: 30,
  iniciada_em: '',
  pausada_em: null,
  tempo_acumulado_segundos: 1800,
  finalizada_em: '',
  criado_em: '',
};

const resultadoAlto: ResultadoTentativa = {
  tentativa: { ...tentativaBase, acertos: 27, nota: 90 },
  questoes: [],
  respostas: [],
  distribuicao_temas: [
    { tema: temas[0], total: 15, acertos: 14 },
    { tema: temas[1], total: 15, acertos: 13 },
  ],
};

const meta: Meta<ResultadoSummaryComponent> = {
  title: 'Provas/ResultadoSummary',
  component: ResultadoSummaryComponent,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: { resultado: resultadoAlto },
};

export default meta;
type Story = StoryObj<ResultadoSummaryComponent>;

export const NotaAlta: Story = {};

export const NotaMedia: Story = {
  args: {
    resultado: {
      ...resultadoAlto,
      tentativa: { ...tentativaBase, acertos: 17, nota: 57 },
    },
  },
};

export const NotaBaixa: Story = {
  args: {
    resultado: {
      ...resultadoAlto,
      tentativa: { ...tentativaBase, acertos: 8, nota: 27 },
    },
  },
};

export const SemTemas: Story = {
  args: {
    resultado: {
      ...resultadoAlto,
      distribuicao_temas: [],
    },
  },
};

/** Plano gratuito: impressão visível com o selo PRO, sem navegar. */
export const ImpressaoBloqueada: Story = {
  args: {
    impressaoBloqueada: true,
  },
};
