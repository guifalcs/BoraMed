import type { Meta, StoryObj } from '@storybook/angular';
import { CorrecaoFeedbackComponent } from './correcao-feedback.component';
import type { RespostaCorrecao } from '../../../core/models/correcao';

const base: RespostaCorrecao = {
  id: 'rc-1',
  tentativa_resposta_id: 'tr-1',
  status: 'corrigida',
  pontos: 85,
  feedback:
    'Boa resposta! Você identificou corretamente a tríade de Charcot e a associou à colangite aguda. Faltou citar a conduta inicial.',
  pontos_atendidos: ['Cita febre', 'Cita icterícia', 'Cita dor em hipocôndrio direito'],
  pontos_faltantes: ['Menciona antibioticoterapia precoce'],
  erros: [],
  provider: 'openai-compat',
  modelo: 'gpt-4o-mini',
  num_tentativas: 1,
  criado_em: '2026-07-07T12:00:00Z',
  atualizado_em: '2026-07-07T12:00:10Z',
};

const meta: Meta<CorrecaoFeedbackComponent> = {
  title: 'Provas/CorrecaoFeedback',
  component: CorrecaoFeedbackComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<CorrecaoFeedbackComponent>;

export const NotaAlta: Story = {
  args: { correcao: base },
};

export const NotaMedia: Story = {
  args: {
    correcao: {
      ...base,
      pontos: 55,
      feedback: 'Resposta parcialmente correta: a tríade está incompleta.',
      pontos_atendidos: ['Cita febre'],
      pontos_faltantes: ['Cita icterícia', 'Cita dor em hipocôndrio direito'],
    },
  },
};

export const NotaBaixaComErros: Story = {
  args: {
    correcao: {
      ...base,
      pontos: 20,
      feedback: 'A resposta confunde os achados clínicos com a pêntade de Reynolds.',
      pontos_atendidos: [],
      pontos_faltantes: ['Cita febre', 'Cita icterícia', 'Cita dor em hipocôndrio direito'],
      erros: ['Hipotensão e confusão mental pertencem à pêntade de Reynolds, não à tríade de Charcot.'],
    },
  },
};

export const Corrigindo: Story = {
  args: {
    correcao: { ...base, status: 'corrigindo', pontos: null, feedback: null },
  },
};

export const Erro: Story = {
  args: {
    correcao: { ...base, status: 'erro', pontos: null, feedback: null },
  },
};

export const SemIa: Story = {
  args: {
    correcao: { ...base, status: 'sem_ia', pontos: null, feedback: null },
  },
};
