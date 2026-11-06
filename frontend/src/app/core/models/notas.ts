/**
 * Minhas notas: dimensões de nota por período (ver migration
 * 20261106120000_notas_dimensoes_periodo.sql e docs/minhas-notas.md).
 *
 * Árvore: regulamento → eixos (SOI, HAM…) → dimensões (cognitiva,
 * habilidades, única) → itens (Prova N1, APG…) → subitens opcionais. A nota
 * do aluno vai sempre na FOLHA: no item sem subitens, ou em cada subitem.
 */

export type TipoDimensao = 'cognitiva' | 'habilidades' | 'unica';
export type StatusRegulamento = 'rascunho' | 'publicado' | 'arquivado';

export interface NotasSubitem {
  id: string;
  nome: string;
  pontos: number;
  descricao: string | null;
}

export interface NotasItem extends NotasSubitem {
  subitens: NotasSubitem[];
}

export interface NotasDimensao {
  id: string;
  tipo: TipoDimensao;
  nome: string;
  pontos_total: number;
  itens: NotasItem[];
}

export interface NotasEixo {
  id: string;
  sigla: string;
  nome: string;
  exame_especial: boolean;
  dimensoes: NotasDimensao[];
}

export interface NotasRegulamento {
  id: string;
  periodo: number;
  semestre: string;
  titulo: string | null;
  fonte: string | null;
  /** Percentual mínimo de cada dimensão (70 = 70%). */
  nota_minima: number;
  /** Piso (%) da cognitiva para ter direito ao exame especial. */
  nota_minima_exame: number;
  frequencia_minima: number;
  observacao: string | null;
  status: StatusRegulamento;
  publicado_em: string | null;
  notificado_em: string | null;
  atualizado_em: string;
  eixos: NotasEixo[];
}

export interface NotaLancamento {
  item_id: string;
  nota: number;
  atualizado_em: string;
}

/** Resposta de `get_minhas_notas`. */
export interface MinhasNotas {
  periodo: number | null;
  periodos_disponiveis: number[];
  regulamento: NotasRegulamento | null;
  lancamentos: NotaLancamento[];
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export interface AdminNotasRegulamentoResumo {
  id: string;
  periodo: number;
  semestre: string;
  titulo: string | null;
  fonte: string | null;
  status: StatusRegulamento;
  publicado_em: string | null;
  notificado_em: string | null;
  criado_em: string;
  atualizado_em: string;
  total_eixos: number;
  total_dimensoes: number;
  siglas: string | null;
  alunos_com_notas: number;
  alunos_no_periodo: number;
}

export interface AdminNotasRegulamento extends NotasRegulamento {
  /** item_id → quantos alunos lançaram nota nele. */
  lancamentos_por_item: Record<string, number>;
}

/** Payload de `admin_salvar_notas_regulamento` (ids opcionais = novo). */
export interface NotasRegulamentoPayload {
  id?: string;
  periodo: number;
  semestre: string;
  titulo?: string | null;
  fonte?: string | null;
  nota_minima: number;
  nota_minima_exame: number;
  frequencia_minima: number;
  observacao?: string | null;
  eixos: {
    id?: string;
    sigla: string;
    nome: string;
    exame_especial: boolean;
    dimensoes: {
      id?: string;
      tipo: TipoDimensao;
      nome?: string;
      itens: {
        id?: string;
        nome: string;
        pontos: number;
        descricao?: string | null;
        subitens?: { id?: string; nome: string; pontos: number; descricao?: string | null }[];
      }[];
    }[];
  }[];
}

export interface NotasSalvoResultado {
  id: string;
  status: StatusRegulamento;
  lancamentos_removidos: number;
}

export interface NotasPublicacaoResultado {
  status: StatusRegulamento;
  publicado_em: string | null;
  notificado_em: string | null;
  notificados: number;
  arquivado_id: string | null;
}

export const NOME_PADRAO_DIMENSAO: Record<TipoDimensao, string> = {
  cognitiva: 'Dimensão Cognitiva',
  habilidades: 'Habilidades e Atitudes',
  unica: 'Conhecimentos, Habilidades e Atitudes',
};

/** Rótulo curto (abas, chips). */
export const ROTULO_CURTO_DIMENSAO: Record<TipoDimensao, string> = {
  cognitiva: 'Cognitiva',
  habilidades: 'Habilidades e Atitudes',
  unica: 'Dimensão única',
};
