import type { QuestaoComAlternativas } from './questao';
import type { Tema } from './tema';
import type { RespostaCorrecao } from './correcao';

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
  /** Soma dos pontos por questão (0–100 cada). NULL = tentativa antiga ou não consolidada. */
  pontos?: number | null;
  /** Denominador da nota (total_questoes − sem_ia). NULL = usar total_questoes. */
  total_pontuaveis?: number | null;
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
  /** Envio definitivo de resposta aberta (NULL = rascunho editável). */
  enviada_em?: string | null;
  /** Pontuação 0–100 da resposta (abertas via IA). */
  pontos?: number | null;
  /** Correção por IA (presente em resultados/revisão). */
  correcao?: RespostaCorrecao | null;
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
  /** Correções de IA ainda não resolvidas (nota fica NULL enquanto > 0). */
  correcoes_pendentes?: number;
}
