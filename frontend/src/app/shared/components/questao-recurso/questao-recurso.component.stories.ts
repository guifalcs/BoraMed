import type { Meta, StoryObj } from '@storybook/angular';
import { QuestaoRecursoComponent } from './questao-recurso.component';

const meta: Meta<QuestaoRecursoComponent> = {
  title: 'Provas/QuestaoRecurso',
  component: QuestaoRecursoComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<QuestaoRecursoComponent>;

const RECURSO =
  'A banca reconheceu ambiguidade entre as alternativas B e D. Ambas descrevem condutas aceitáveis segundo as diretrizes vigentes, portanto a questão foi revisada.';

/** Recurso cadastrado, sem anulação: o aluno só visualiza o texto. */
export const ComRecurso: Story = {
  args: {
    recursoTexto: RECURSO,
    anuladaAdmin: false,
    anuladaUsuario: false,
    podeAnular: false,
    questaoNumero: 12,
  },
};

/** Questão anulada pela instituição, com recurso explicando o motivo. */
export const AnuladaPeloAdminComRecurso: Story = {
  args: {
    recursoTexto: RECURSO,
    anuladaAdmin: true,
    anuladaUsuario: false,
    podeAnular: false,
    questaoNumero: 12,
  },
};

/** Questão anulada pela instituição, sem recurso registrado. */
export const AnuladaPeloAdminSemRecurso: Story = {
  args: {
    recursoTexto: null,
    anuladaAdmin: true,
    anuladaUsuario: false,
    podeAnular: false,
    questaoNumero: 12,
  },
};

/** Tentativa ativa, questão sem recurso: botão discreto de anular. */
export const PodeAnular: Story = {
  args: {
    recursoTexto: null,
    anuladaAdmin: false,
    anuladaUsuario: false,
    podeAnular: true,
    questaoNumero: 12,
  },
};

/** Aluno já anulou por conta própria (com opção de desfazer). */
export const AnuladaPeloAluno: Story = {
  args: {
    recursoTexto: null,
    anuladaAdmin: false,
    anuladaUsuario: true,
    podeAnular: true,
    questaoNumero: 12,
  },
};
