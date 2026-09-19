export type TipoQuestaoCadernoErros = 'nacional' | 'processual' | 'laboratorio';
export type StatusCadernoErros = 'pendente' | 'dominada';

export interface QuestaoErroItem {
  questaoId: string;
  enunciado: string;
  tipoQuestao: TipoQuestaoCadernoErros;
  formato: string;
  formatoProva: string | null;
  temas: string[];
  disciplina: string | null;
  provaId: string | null;
  tentativaId: string | null;
  erroEm: string; // ISO date
  status: StatusCadernoErros;
  ultimaRedoCorreta: boolean | null;
  ultimaRedoEm: string | null;
}

export interface CadernoErrosResumo {
  totalPendentes: number;
  porTipoQuestao: Record<TipoQuestaoCadernoErros, number>;
  temaMaisFraco: string | null;
  dominadasUltimos7Dias: number;
}

export interface FiltrosCadernoErros {
  temaIds?: string[];
  disciplinaIds?: string[];
  tipoQuestao?: TipoQuestaoCadernoErros[];
  status?: StatusCadernoErros;
}
