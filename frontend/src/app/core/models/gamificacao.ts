export interface GamificacaoStats {
  xp_total: number;
  xp_semana_atual: number;
  semana_iso: string | null;
  nivel: number;
  streak_atual: number;
  streak_recorde: number;
  freezes_disponiveis: number;
  competir_publico: boolean;
}

export interface ConcederXpTentativaResult {
  xp_ganho: number;
  ja_concedido: boolean;
  novas_conquistas: ConquistaUsuario[];
  stats: GamificacaoStats;
}

export interface StreakEstudoV2 {
  atual: number;
  recorde: number;
  freezes_disponiveis: number;
  freeze_usado_hoje: boolean;
  dias_para_proximo_marco: number;
}

export interface ConquistaUsuario {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  categoria: string;
  xp_recompensa: number;
  secreta?: boolean;
  desbloqueada_em?: string | null;
}

export interface RankingItem {
  user_id: string;
  nome_display: string;
  avatar_url: string | null;
  nivel: number;
  xp_total: number;
  xp_semana_atual: number;
  posicao: number;
  is_me?: boolean;
}

export interface MinhaPosicaoRanking {
  posicao_global: number | null;
  posicao_semana: number | null;
  total_global: number;
  total_semana: number;
}

export interface DesafioAlternativa {
  id: string;
  letra: string;
  texto: string;
  ordem: number;
  correta?: boolean;
}

export interface DesafioQuestao {
  id: string;
  enunciado: string;
  enunciado_apoio: string | null;
  imagem_url: string | null;
  dificuldade: number | null;
  disciplina: string | null;
  explicacao?: string | null;
}

export interface DesafioEstatistica {
  total_responderam: number;
  percentual_acerto: number;
}

export interface DesafioMinhaResposta {
  alternativa_id: string;
  correta: boolean;
  xp_ganho: number;
  respondido_em: string;
}

export interface DesafioDiario {
  disponivel: boolean;
  data: string | null;
  questao: DesafioQuestao | null;
  alternativas: DesafioAlternativa[];
  estatistica: DesafioEstatistica;
  minha_resposta: DesafioMinhaResposta | null;
}

export interface ResponderDesafioResult {
  ja_respondeu: boolean;
  correta: boolean;
  xp_ganho: number;
  novas_conquistas: ConquistaUsuario[];
  stats: GamificacaoStats;
  estatistica: DesafioEstatistica;
}
