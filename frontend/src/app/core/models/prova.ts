import type { Faculdade } from './faculdade';

export type TipoProva = 'autoral' | 'faculdade' | 'nacional' | 'processual' | 'multiestacoes';
export type OrigemProva = 'autoral' | 'faculdade' | 'personalizado';
export type FormatoProva = 'nacional' | 'processual' | 'laboratorio' | 'multiestacoes';
export type SubtipoProva = 'N1' | 'teste_progresso' | 'N2' | 'P1' | 'P2';

export type OrigemGeracao = 'manual' | 'ia_assistida';

export interface Prova {
  id: string;
  faculdade_id: string | null;
  nome: string;
  periodo: number;
  ano: number | null;
  semestre: number | null;
  tipo: TipoProva;
  origem?: OrigemProva;
  formato?: FormatoProva | null;
  rede?: string | null;
  subtipo?: SubtipoProva | null;
  subtipo_nacional: SubtipoProva | null;
  qtd_questoes: number;
  tempo_sugerido_minutos: number | null;
  edicao: number;
  publicada?: boolean;
  arquivada?: boolean;
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
