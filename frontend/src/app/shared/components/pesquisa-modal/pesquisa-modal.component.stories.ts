import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import { PesquisaModalComponent } from './pesquisa-modal.component';
import { PesquisaService } from '../../../core/services/pesquisa.service';
import { AuthService } from '../../../core/services/auth.service';
import type { PesquisaPendente } from '../../../core/models/pesquisa.types';

const PESQUISA_COMPLETA: PesquisaPendente = {
  id: 'preview',
  titulo: 'Como está sendo sua experiência no BoraMed?',
  descricao: 'São 5 perguntas rápidas. Suas respostas definem o que entra no próximo mês.',
  perguntas: [
    {
      id: 'q1',
      tipo: 'nps',
      enunciado: 'De 0 a 10, o quanto você recomendaria o BoraMed para um colega?',
      ajuda: null,
      obrigatoria: true,
      escala_min: 0,
      escala_max: 10,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [],
    },
    {
      id: 'q2',
      tipo: 'escolha_unica',
      enunciado: 'Qual módulo você mais usa?',
      ajuda: null,
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [
        { id: 'o1', label: 'Treinos nacionais' },
        { id: 'o2', label: 'Simulados montados por tema' },
        { id: 'o3', label: 'Flashcards' },
        { id: 'o4', label: 'Materiais' },
      ],
    },
    {
      id: 'q3',
      tipo: 'multipla_escolha',
      enunciado: 'O que você gostaria de ver primeiro?',
      ajuda: 'Pode marcar mais de uma.',
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [
        { id: 'o5', label: 'Mais questões de laboratório' },
        { id: 'o6', label: 'Correção discursiva mais detalhada' },
        { id: 'o7', label: 'App mobile' },
      ],
    },
    {
      id: 'q4',
      tipo: 'escala',
      enunciado: 'O quanto as explicações das questões te ajudam?',
      ajuda: null,
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: 'Pouco',
      escala_max_label: 'Muito',
      opcoes: [],
    },
    {
      id: 'q5',
      tipo: 'texto_longo',
      enunciado: 'O que mais faz falta hoje?',
      ajuda: null,
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [],
    },
  ],
};

function providers(pesquisa: PesquisaPendente | null, impersonando = false) {
  return [
    {
      provide: PesquisaService,
      useValue: {
        pesquisaAtual: signal(pesquisa),
        temPesquisas: signal(pesquisa !== null),
        verificar: () => Promise.resolve(),
        responder: () => Promise.resolve({ ok: true as const }),
        dispensar: () => Promise.resolve(true),
      },
    },
    {
      provide: AuthService,
      useValue: { impersonando: signal(impersonando) },
    },
  ];
}

const meta: Meta<PesquisaModalComponent> = {
  title: 'Shared/PesquisaModal',
  component: PesquisaModalComponent,
};

export default meta;
type Story = StoryObj<PesquisaModalComponent>;

export const TodosOsTipos: Story = {
  decorators: [moduleMetadata({ providers: providers(PESQUISA_COMPLETA) })],
};

export const UmaPerguntaSo: Story = {
  decorators: [
    moduleMetadata({
      providers: providers({
        id: 'curta',
        titulo: 'Rapidinho: o que achou do novo dashboard?',
        descricao: null,
        perguntas: [PESQUISA_COMPLETA.perguntas[4]],
      }),
    }),
  ],
};

/** Durante impersonação o modal some: a resposta seria gravada no nome do aluno. */
export const DuranteImpersonacao: Story = {
  decorators: [moduleMetadata({ providers: providers(PESQUISA_COMPLETA, true) })],
};

export const Vazio: Story = {
  decorators: [moduleMetadata({ providers: providers(null) })],
};
