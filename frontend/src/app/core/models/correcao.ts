export type StatusCorrecao = 'pendente' | 'corrigindo' | 'corrigida' | 'erro' | 'sem_ia';

/** Estado/resultado da correção por IA de uma resposta aberta (1:1 com tentativa_resposta). */
export interface RespostaCorrecao {
  id: string;
  tentativa_resposta_id: string;
  status: StatusCorrecao;
  pontos: number | null;
  feedback: string | null;
  pontos_atendidos: string[] | null;
  pontos_faltantes: string[] | null;
  erros: string[] | null;
  provider: string | null;
  modelo: string | null;
  num_tentativas: number;
  criado_em: string;
  atualizado_em: string;
}

/** Retorno de get_status_correcoes (polling da tela de resultado). */
export interface StatusCorrecoesTentativa {
  total: number;
  corrigidas: number;
  pendentes: number;
  erros: number;
  sem_ia: number;
  itens: { tentativa_resposta_id: string; status: StatusCorrecao }[];
}
