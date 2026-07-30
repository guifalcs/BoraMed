import type { Faculdade } from './faculdade';

export type TipoProva = 'autoral' | 'faculdade';
export type OrigemProva = 'autoral' | 'faculdade' | 'personalizado';
export type FormatoProva = 'nacional' | 'processual' | 'laboratorio' | 'multiestacoes';
export type SubtipoProva = 'N1' | 'teste_progresso' | 'N2' | 'integradora';

export type OrigemGeracao = 'manual' | 'ia_assistida';

export interface Prova {
  id: string;
  faculdade_id: string | null;
  nome: string;
  /** Nulo em provas sem período específico — hoje, apenas as TPI. */
  periodo: number | null;
  tipo: TipoProva;
  origem: OrigemProva;
  formato: FormatoProva | null;
  rede: string | null;
  subtipo: SubtipoProva | null;
  subtipo_nacional: SubtipoProva | null;
  qtd_questoes: number;
  publicada: boolean;
  arquivada: boolean;
  criado_em: string;
}

export interface ProvaComFaculdade extends Prova {
  faculdade: Pick<Faculdade, 'nome' | 'sigla'> | null;
}

export interface FiltrosProvas {
  subtipo: SubtipoProva | null;
  periodo: number | null;
  formato?: FormatoProva | null;
  rede?: string | null;
}

export interface ListarProvasParams {
  rede?: string | null;
  subtipos?: SubtipoProva[];
  periodos?: number[];
  disciplinaIds?: string[];
  busca?: string;
  pagina?: number;
  porPagina?: number;
}

export interface ProvasPaginadas {
  provas: Prova[];
  total: number;
}

/**
 * O teste de progresso é aplicado a todos os períodos ao mesmo tempo, então é a
 * única prova que fica sem `periodo`. `subtipo` é a coluna atual; `subtipo_nacional`
 * é a legada, mantida no fallback.
 */
export function ehTesteProgresso(
  prova: Pick<Prova, 'subtipo' | 'subtipo_nacional'>,
): boolean {
  return (prova.subtipo ?? prova.subtipo_nacional) === 'teste_progresso';
}

/** Rótulo do período, com o texto de "sem período" para as TPI. */
export function periodoLabel(periodo: number | null | undefined, curto = false): string {
  if (periodo === null || periodo === undefined) return curto ? 'Todos' : 'Todos os períodos';
  return curto ? `${periodo}º P` : `${periodo}º período`;
}
