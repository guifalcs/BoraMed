import type { Meta, StoryObj } from '@storybook/angular';
import { QuestaoCardComponent } from './questao-card.component';
import type { QuestaoComAlternativas } from '../../../core/models/questao';

const questao: QuestaoComAlternativas = {
  id: 'q1',
  codigo_externo: null,
  enunciado_apoio:
    'Paciente de 28 anos, sexo feminino, chega ao pronto-socorro com dispneia súbita, urticária generalizada e hipotensão arterial após injeção de penicilina.',
  enunciado: 'Qual é a conduta imediata mais adequada para este caso?',
  imagem_url: null,
  imagem_legenda: null,
  formato: 'multipla_escolha',
  resposta_correta_texto: null,
  respostas_aceitas: null,
  explicacao:
    'O choque anafilático requer adrenalina 0,3mg IM no vasto lateral da coxa como primeira medida.',
  explicacao_alternativas: null,
  referencia: 'Medicina de Urgência, 2ª ed., cap. 14',
  dificuldade: 3,
  disciplina: 'MCM',
  periodo: 1,
  prova_id: 'prova-1',
  ordem_na_prova: 1,
  fonte: null,
  vezes_respondida: 120,
  vezes_acertada: 78,
  taxa_acerto: 65,
  status: 'ativa',
  revisado: true,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
  alternativas: [
    { id: 'a1', questao_id: 'q1', letra: 'A', texto: 'Administrar adrenalina 0,3mg IM imediatamente', correta: true, ordem: 1, imagem_url: null },
    { id: 'a2', questao_id: 'q1', letra: 'B', texto: 'Aplicar corticosteroide IV em dose alta', correta: false, ordem: 2, imagem_url: null },
    { id: 'a3', questao_id: 'q1', letra: 'C', texto: 'Administrar anti-histamínico IM', correta: false, ordem: 3, imagem_url: null },
    { id: 'a4', questao_id: 'q1', letra: 'D', texto: 'Intubar o paciente imediatamente', correta: false, ordem: 4, imagem_url: null },
    { id: 'a5', questao_id: 'q1', letra: 'E', texto: 'Observar e aguardar estabilização espontânea', correta: false, ordem: 5, imagem_url: null },
  ],
  temas: [],
};

const meta: Meta<QuestaoCardComponent> = {
  title: 'Provas/QuestaoCard',
  component: QuestaoCardComponent,
  tags: ['autodocs'],
  args: { questao, numero: 1, modo: 'simulado', respostaSelecionada: null, alternativaCorreta: null, gabaritioVisivel: false },
  argTypes: {
    modo: { control: 'inline-radio', options: ['simulado', 'estudo', 'visualizar'] },
  },
};

export default meta;
type Story = StoryObj<QuestaoCardComponent>;

export const SemResposta: Story = {};

export const RespostaSelecionada: Story = {
  args: { respostaSelecionada: 'a2' },
};

export const RespostaCorretaEstudo: Story = {
  args: { modo: 'estudo', respostaSelecionada: 'a1', alternativaCorreta: 'a1' },
};

export const RespostaErradaEstudo: Story = {
  args: { modo: 'estudo', respostaSelecionada: 'a2', alternativaCorreta: 'a1' },
};

export const ModoVisualizar: Story = {
  args: { modo: 'visualizar', gabaritioVisivel: true },
};

export const SemEnunciadoApoio: Story = {
  args: { questao: { ...questao, enunciado_apoio: null } },
};

export const ComImagem: Story = {
  args: {
    questao: {
      ...questao,
      imagem_url: 'https://placehold.co/600x400/e2e8f0/64748b?text=Lâmina+histológica',
      imagem_legenda: 'Lâmina corada por HE, aumento 400x',
      enunciado_apoio: null,
    },
  },
};
