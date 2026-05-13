import type { Faculdade } from './faculdade';

export type TipoProva = 'nacional' | 'processual' | 'multiestacoes';
export type SubtipoProva = 'N1' | 'teste_progresso' | 'N2';

export type OrigemGeracao = 'manual' | 'ia_assistida';
export type FormatoProva = 'N1' | 'N2' | 'nacional' | 'P1' | 'P2';

export interface Prova {
  id: string;
  faculdade_id: string | null;
  nome: string;
  periodo: number;
  ano: number | null;
  semestre: number | null;
  tipo: TipoProva;
  subtipo_nacional: SubtipoProva | null;
  qtd_questoes: number;
  tempo_sugerido_minutos: number | null;
  edicao: number;
  criado_em: string;
}

export interface ProvaComFaculdade extends Prova {
  faculdade: Pick<Faculdade, 'nome' | 'sigla'> | null;
}

export interface FiltrosProvas {
  subtipo: SubtipoProva | null;
  periodo: number | null;
}
