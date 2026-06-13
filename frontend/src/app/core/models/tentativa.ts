import type { QuestaoComAlternativas } from './questao';
import type { Tema } from './tema';

export type ModoProva = 'simulado' | 'estudo' | 'visualizar';
export type StatusTentativa = 'em_andamento' | 'pausada' | 'finalizada';

export interface Tentativa {
  id: string;
  user_id: string;
  /** null quando a prova foi deletada pelo admin (histórico preservado) */
  prova_id: string | null;
  modo: ModoProva;
  status: StatusTentativa;
  total_questoes: number;
  total_respondidas: number;
  acertos: number;
  nota: number | null;
  iniciada_em: string;
  pausada_em: string | null;
  tempo_acumulado_segundos: number;
  finalizada_em: string | null;
  criado_em: string;
}

export interface TentativaResposta {
  id: string;
  tentativa_id: string;
  questao_id: string;
  alternativa_id: string | null;
  resposta_texto: string | null;
  correta: boolean | null;
  tempo_gasto_segundos: number | null;
  ordem_na_tentativa: number | null;
  respondida_em: string | null;
}

export interface QuestaoAnotacao {
  id: string;
  user_id: string;
  tentativa_id: string;
  questao_id: string;
  conteudo: string;
  criado_em: string;
  atualizado_em: string;
}

export interface DistribuicaoTema {
  tema: Tema;
  total: number;
  acertos: number;
}

export interface ResultadoTentativa {
  tentativa: Tentativa;
  questoes: QuestaoComAlternativas[];
  respostas: TentativaResposta[];
  distribuicao_temas: DistribuicaoTema[];
}
