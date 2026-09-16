import type { SegmentoAcesso } from './subscription.types';

/** Tipos de campo suportados pelo construtor de pesquisas. */
export type TipoPergunta =
  | 'texto_curto'
  | 'texto_longo'
  | 'escolha_unica'
  | 'multipla_escolha'
  | 'escala'
  | 'nps';

export const TIPOS_PERGUNTA: readonly { valor: TipoPergunta; label: string; ajuda: string }[] = [
  { valor: 'texto_curto', label: 'Texto curto', ajuda: 'Uma linha.' },
  { valor: 'texto_longo', label: 'Texto longo', ajuda: 'Campo de várias linhas.' },
  { valor: 'escolha_unica', label: 'Escolha única', ajuda: 'Radio: uma alternativa.' },
  { valor: 'multipla_escolha', label: 'Múltipla escolha', ajuda: 'Checkbox: várias alternativas.' },
  { valor: 'escala', label: 'Escala', ajuda: 'Nota entre dois extremos.' },
  { valor: 'nps', label: 'NPS', ajuda: 'Recomendaria? de 0 a 10.' },
];

export interface PesquisaOpcao {
  id: string;
  label: string;
}

export interface PesquisaPergunta {
  id: string;
  tipo: TipoPergunta;
  enunciado: string;
  ajuda: string | null;
  obrigatoria: boolean;
  /** Só vale para `escala`. `nps` é sempre 0–10. */
  escala_min: number;
  escala_max: number;
  escala_min_label: string | null;
  escala_max_label: string | null;
  opcoes: PesquisaOpcao[];
}

/** Payload de `buscar_pesquisas_pendentes()`. */
export interface PesquisaPendente {
  id: string;
  titulo: string;
  descricao: string | null;
  perguntas: PesquisaPergunta[];
}

/** Item enviado em `responder_pesquisa`. Campos vazios = pergunta pulada. */
export interface RespostaItemInput {
  pergunta_id: string;
  texto?: string | null;
  numero?: number | null;
  opcao_ids?: string[];
}

/** Linha da listagem do admin. */
export interface AdminPesquisa {
  id: string;
  titulo: string;
  descricao: string | null;
  segmento: SegmentoAcesso;
  ativa: boolean;
  encerra_em: string | null;
  criado_em: string;
  atualizado_em: string;
  total_perguntas: number;
  total_respostas: number;
  total_dispensas: number;
}

/** Estrutura completa carregada pelo editor. */
export interface AdminPesquisaDetalhe {
  id: string;
  titulo: string;
  descricao: string | null;
  segmento: SegmentoAcesso;
  ativa: boolean;
  encerra_em: string | null;
  criado_em: string;
  atualizado_em: string;
  /** > 0 congela a estrutura (ver `admin_salvar_pesquisa`). */
  total_respostas: number;
  perguntas: PesquisaPergunta[];
}

/** Pergunta em edição: `id` nulo enquanto não foi salva. */
export interface PerguntaRascunho {
  id: string | null;
  tipo: TipoPergunta;
  enunciado: string;
  ajuda: string | null;
  obrigatoria: boolean;
  escala_min: number;
  escala_max: number;
  escala_min_label: string | null;
  escala_max_label: string | null;
  opcoes: { id: string | null; label: string }[];
  /** Chave estável de `@for`, já que `id` só existe depois do primeiro save. */
  key: string;
}

export interface PesquisaSalvarInput {
  id?: string | null;
  titulo: string;
  descricao: string | null;
  segmento: SegmentoAcesso;
  ativa: boolean;
  encerra_em: string | null;
  /** Omitido quando a pesquisa já tem respostas — a estrutura está congelada. */
  perguntas?: Omit<PerguntaRascunho, 'key'>[];
}

export interface ResultadoOpcao {
  id: string;
  label: string;
  total: number;
}

export interface ResultadoTexto {
  texto: string;
  usuario: string;
  criado_em: string;
}

export interface ResultadoPergunta {
  id: string;
  tipo: TipoPergunta;
  enunciado: string;
  obrigatoria: boolean;
  escala_min: number;
  escala_max: number;
  escala_min_label: string | null;
  escala_max_label: string | null;
  total_respondido: number;
  opcoes: ResultadoOpcao[];
  media: number | null;
  distribuicao: { valor: number; total: number }[];
  /** Score NPS (-100 a 100); null fora de perguntas `nps` ou sem respostas. */
  nps: number | null;
  /** Amostra das respostas de texto: as 300 mais recentes. */
  textos: ResultadoTexto[] | null;
  /** Total real de respostas de texto, que pode ser maior que `textos`. */
  textos_total: number | null;
}

export interface PesquisaResultados {
  id: string;
  titulo: string;
  descricao: string | null;
  segmento: SegmentoAcesso;
  ativa: boolean;
  encerra_em: string | null;
  criado_em: string;
  total_respostas: number;
  total_dispensas: number;
  perguntas: ResultadoPergunta[];
}
