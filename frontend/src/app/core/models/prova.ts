import type { Faculdade } from './faculdade';

export type TipoProva = 'nacional' | 'processual' | 'multiestacoes';
export type SubtipoProva = 'N1' | 'teste_progresso' | 'N2';

export interface Prova {
  id: string;
  faculdade_id: string;
  nome: string;
  periodo: number;
  ano: number;
  semestre: number;
  tipo: TipoProva;
  subtipo_nacional: SubtipoProva | null;
  qtd_questoes: number;
  tempo_sugerido_minutos: number | null;
  criado_em: string;
}

export interface ProvaComFaculdade extends Prova {
  faculdade: Pick<Faculdade, 'nome' | 'sigla'>;
}

export interface FiltrosProvas {
  subtipo: SubtipoProva | null;
  periodo: number | null;
  ano: number | null;
}
