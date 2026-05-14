import type { ModoProva } from './tentativa';

export interface HistoricoKpis {
  taxa_acerto: number | null;
  total_finalizadas: number;
  tema_mais_fraco: string | null;
  taxa_tema_fraco: number | null;
  ultima_nota: number | null;
  ultima_nota_data: string | null;
}

export interface DesempenhoTema {
  tema_nome: string;
  total: number;
  acertos: number;
  taxa: number;
}

export interface TentativaHistoricoItem {
  id: string;
  prova_id: string;
  modo: ModoProva;
  nota: number | null;
  total_questoes: number;
  acertos: number;
  finalizada_em: string | null;
  prova_nome: string;
}
