import type { Meta, StoryObj } from '@storybook/angular';
import { QuestaoCardComponent } from './questao-card.component';
import type { Alternativa } from '../../../core/models/alternativa';
import type { QuestaoComAlternativas } from '../../../core/models/questao';

const alternativasBase: Alternativa[] = [
  { id: 'a1', questao_id: 'q1', letra: 'A', texto: 'Administrar adrenalina 0,3mg IM imediatamente', correta: true, ordem: 1, imagem_url: null },
  { id: 'a2', questao_id: 'q1', letra: 'B', texto: 'Aplicar corticosteroide IV em dose alta', correta: false, ordem: 2, imagem_url: null },
  { id: 'a3', questao_id: 'q1', letra: 'C', texto: 'Administrar anti-histamínico IM', correta: false, ordem: 3, imagem_url: null },
  { id: 'a4', questao_id: 'q1', letra: 'D', texto: 'Intubar o paciente imediatamente', correta: false, ordem: 4, imagem_url: null },
  { id: 'a5', questao_id: 'q1', letra: 'E', texto: 'Observar e aguardar estabilização espontânea', correta: false, ordem: 5, imagem_url: null },
];

const questaoBase: QuestaoComAlternativas = {
  id: 'q1',
  codigo_externo: null,
  enunciado_apoio: 'Paciente de 28 anos, sexo feminino, chega ao pronto-socorro com dispneia súbita, urticária generalizada e hipotensão arterial após injeção de penicilina.',
  enunciado: 'Qual é a conduta imediata mais adequada para este caso?',
  imagem_url: null,
  imagem_legenda: null,
  formato: 'multipla_escolha',
  tipo_questao: 'nacional',
  resposta_correta_texto: null,
  respostas_aceitas: null,
  explicacao: 'O choque anafilático requer adrenalina 0,3mg IM no vasto lateral da coxa como primeira medida.',
  explicacao_alternativas: null,
  referencia: 'Medicina de Urgência, 2ª ed., cap. 14',
  disciplina: 'MCM',
  periodo: 1,
  prova_id: 'prova-1',
  ordem_na_prova: 1,
  fonte: null,
  vezes_respondida: 120,
  vezes_acertada: 78,
  taxa_acerto: 65,
  status: 'publicada',
  revisado: true,
  autor_id: null,
  revisor_id: null,
  aprovada_em: null,
  publicada_em: '2024-01-01T00:00:00Z',
  origem_geracao: 'manual',
  nivel_bloom: 3,
  formato_prova: 'N1',
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
  alternativas: alternativasBase,
  temas: [],
};

const meta: Meta<QuestaoCardComponent> = {
  title: 'Provas/QuestaoCard',
  component: QuestaoCardComponent,
  tags: ['autodocs'],
  args: { questao: questaoBase, numero: 1, modo: 'simulado', respostaSelecionada: null, alternativaCorreta: null, gabaritioVisivel: false },
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

export const SemCasoClinoco: Story = {
  args: {
    numero: 2,
    questao: {
      ...questaoBase,
      enunciado_apoio: null,
      enunciado: '*(UNIFIPMOC)* Um homem de 62 anos apresenta dor torácica em aperto. A análise do caso permite concluir que:',
    },
  },
};

export const ComCasoClinoco: Story = {
  args: {
    numero: 1,
    questao: {
      ...questaoBase,
      enunciado_apoio: '*(FIP Guanambi)* Um neonato a termo apresenta cianose central. A ecocardiografia revela estrutura fetal aberta permitindo shunt esquerda-direita.',
      enunciado: 'Com base no cenário clínico, qual estrutura fetal falhou em seu processo de fechamento fisiológico?',
    },
  },
};

export const ComImagem: Story = {
  args: {
    numero: 4,
    questao: {
      ...questaoBase,
      enunciado_apoio: '*(UNISL Porto Velho)* A hemoglobina possui variações nas cadeias polipeptídicas: **HbF**, **HbA1**, **HbA2** e **HbS**.',
      enunciado: 'Analise a figura e marque a alternativa que representa adequadamente cada tipo de hemoglobina.',
      imagem_url: 'https://gakvktwtdunljojghpff.supabase.co/storage/v1/object/public/questoes-lab/soi-2025/IMG_2156.png',
      imagem_legenda: 'Fonte: Autoria do Elaborador',
      alternativas: [
        { id: 'b1', questao_id: 'q4', letra: 'A' as const, texto: 'A figura "B" representa a hemoglobina mais encontrada no feto e no recém-nascido.', correta: true, ordem: 1, imagem_url: null },
        { id: 'b2', questao_id: 'q4', letra: 'B' as const, texto: 'A figura "A" representa a hemoglobina que está em menor quantidade nos adultos.', correta: false, ordem: 2, imagem_url: null },
        { id: 'b3', questao_id: 'q4', letra: 'C' as const, texto: 'A figura "B" representa a hemoglobina que possui menor afinidade com oxigênio.', correta: false, ordem: 3, imagem_url: null },
        { id: 'b4', questao_id: 'q4', letra: 'D' as const, texto: 'A figura "C" representa a hemoglobina que está em maior quantidade nos adultos.', correta: false, ordem: 4, imagem_url: null },
      ],
    },
  },
};

export const ComMarkdownRico: Story = {
  args: {
    numero: 9,
    questao: {
      ...questaoBase,
      enunciado_apoio: null,
      enunciado: 'Avalie as assertivas: **I.** O endotélio íntegro é anticoagulante. **PORQUE** **II.** O endotélio lesado libera FvW e reduz PGI₂ e NO, favorecendo agregação plaquetária.',
    },
  },
};

const RECURSO_TXT =
  'A banca reconheceu ambiguidade entre as alternativas A e B e revisou o gabarito. Ambas as condutas são aceitáveis segundo as diretrizes vigentes.';

/** Recurso cadastrado (sem anulação): o aluno só visualiza o texto. */
export const ComRecurso: Story = {
  args: {
    questao: { ...questaoBase, recurso_texto: RECURSO_TXT },
  },
};

/** Questão anulada pela instituição, com recurso explicando o motivo. */
export const AnuladaPeloAdmin: Story = {
  args: {
    questao: { ...questaoBase, anulada: true, recurso_texto: RECURSO_TXT },
  },
};

/** Tentativa ativa, questão sem recurso: botão discreto de anular. */
export const PodeAnular: Story = {
  args: {
    podeAnular: true,
  },
};

/** Aluno já anulou por conta própria (com opção de desfazer). */
export const AnuladaPeloAluno: Story = {
  args: {
    podeAnular: true,
    anuladaUsuario: true,
  },
};

/** Questão fechada com gêmea discursiva: dá para responder por escrito. */
export const ComGemeaDiscursiva: Story = {
  args: {
    podeAnular: true,
    formatoGemea: 'resposta_aberta_curta',
  },
};

/** Modo foco: sem a troca de formato, mas ainda com o botão de anular. */
export const ModoFoco: Story = {
  args: {
    podeAnular: true,
    formatoGemea: 'resposta_aberta_curta',
    focoAtivo: true,
  },
};

/** A mesma questão no formato discursivo, oferecendo a volta às alternativas. */
export const ComGemeaFechada: Story = {
  args: {
    questao: {
      ...questaoBase,
      formato: 'resposta_aberta_curta',
      enunciado: 'Descreva a conduta imediata para este caso e justifique.',
      alternativas: [],
    },
    formatoGemea: 'multipla_escolha',
  },
};

/** Troca em andamento: botão travado até o servidor responder. */
export const TrocandoFormato: Story = {
  args: {
    formatoGemea: 'resposta_aberta_curta',
    trocandoFormato: true,
  },
};
