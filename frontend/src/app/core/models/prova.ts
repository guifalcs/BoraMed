import type { Faculdade } from './faculdade';

export type TipoProva = 'autoral' | 'faculdade';
export type OrigemProva = 'autoral' | 'faculdade' | 'personalizado';
export type FormatoProva = 'nacional' | 'processual' | 'laboratorio' | 'multiestacoes';
export type SubtipoProva = 'N1' | 'teste_progresso' | 'N2';

export type OrigemGeracao = 'manual' | 'ia_assistida';

export interface Prova {
  id: string;
  faculdade_id: string | null;
  nome: string;
  periodo: number;
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
  pagina?: number;
  porPagina?: number;
}

export interface ProvasPaginadas {
  provas: Prova[];
  total: number;
}
