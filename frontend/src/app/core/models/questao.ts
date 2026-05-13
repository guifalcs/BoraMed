import type { Alternativa } from './alternativa';
import type { Tema } from './tema';

export interface Questao {
  id: string;
  codigo_externo: string | null;
  enunciado_apoio: string | null;
  enunciado: string;
  imagem_url: string | null;
  imagem_legenda: string | null;
  formato: 'multipla_escolha' | 'resposta_aberta_curta' | 'verdadeiro_falso' | 'associacao';
  resposta_correta_texto: string | null;
  respostas_aceitas: string[] | null;
  explicacao: string | null;
  explicacao_alternativas: Record<string, string> | null;
  referencia: string | null;
  dificuldade: number | null;
  disciplina: string | null;
  periodo: number | null;
  prova_id: string | null;
  ordem_na_prova: number | null;
  fonte: string | null;
  vezes_respondida: number;
  vezes_acertada: number;
  taxa_acerto: number | null;
  status: 'ativa' | 'rascunho' | 'arquivada' | 'em_revisao' | 'publicada';
  revisado: boolean;
  autor_id: string | null;
  revisor_id: string | null;
  aprovada_em: string | null;
  publicada_em: string | null;
  origem_geracao: 'manual' | 'ia_assistida';
  nivel_bloom: number | null;
  formato_prova: 'N1' | 'N2' | 'nacional' | 'P1' | 'P2' | null;
  criado_em: string;
  atualizado_em: string;
}

export interface QuestaoComAlternativas extends Questao {
  alternativas: Alternativa[];
  temas: Tema[];
}
