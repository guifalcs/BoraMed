/** Letras possíveis de uma questão objetiva. */
export const LETRAS_GABARITO = ['A', 'B', 'C', 'D', 'E'] as const;
export type LetraGabarito = (typeof LETRAS_GABARITO)[number];

/** Tipos de prova sugeridos no editor (o banco aceita texto livre curto). */
export const TIPOS_PROVA_SUGERIDOS = ['N1', 'N2', 'P1', 'P2', 'Integradora', 'TPI', 'SOI', 'HAM'] as const;

export type GabaritoStatus = 'rascunho' | 'publicado';

export interface GabaritoProvaQuestao {
  numero: number;
  /** null + não anulada = "em análise" (a equipe ainda não fechou a letra). */
  resposta: LetraGabarito | null;
  anulada: boolean;
  area: string | null;
  comentario: string | null;
}

/** Item da lista pública (`listar_gabaritos_provas`). */
export interface GabaritoProvaResumo {
  id: string;
  slug: string;
  titulo: string | null;
  tipo_prova: string;
  periodo: number;
  semestre: string;
  data_prova: string | null;
  qtd_alternativas: number;
  conferido_oficial: boolean;
  publicado_em: string;
  atualizado_em: string;
  visualizacoes: number;
  total_questoes: number;
  total_anuladas: number;
}

/**
 * Vitrine pública (`get_gabarito_prova_vitrine`): o que o visitante sem conta
 * vê. Nenhuma letra nem comentário, só a prova e as contagens.
 */
export interface GabaritoProvaVitrine {
  id: string;
  slug: string;
  titulo: string | null;
  tipo_prova: string;
  periodo: number;
  semestre: string;
  data_prova: string | null;
  qtd_alternativas: number;
  conferido_oficial: boolean;
  publicado_em: string;
  atualizado_em: string;
  visualizacoes: number;
  total_questoes: number;
  total_anuladas: number;
  total_comentadas: number;
}

/** Gabarito completo (`get_gabarito_prova`, só para quem tem conta). */
export interface GabaritoProva {
  id: string;
  slug: string;
  titulo: string | null;
  tipo_prova: string;
  periodo: number;
  semestre: string;
  data_prova: string | null;
  observacao: string | null;
  qtd_alternativas: number;
  status: GabaritoStatus;
  conferido_oficial: boolean;
  publicado_em: string | null;
  atualizado_em: string;
  visualizacoes: number;
  questoes: GabaritoProvaQuestao[];
}

/** Linha da tabela do admin (`admin_listar_gabaritos_provas`). */
export interface AdminGabaritoProva {
  id: string;
  slug: string;
  titulo: string | null;
  tipo_prova: string;
  periodo: number;
  semestre: string;
  data_prova: string | null;
  qtd_alternativas: number;
  status: GabaritoStatus;
  conferido_oficial: boolean;
  publicado_em: string | null;
  notificado_em: string | null;
  visualizacoes: number;
  criado_em: string;
  atualizado_em: string;
  total_questoes: number;
  total_preenchidas: number;
  /** Campanha de e-mail do gabarito (no máximo uma). null = e-mail ainda não saiu. */
  email_campanha_id: string | null;
  email_status: 'enviando' | 'enviada' | 'parcial' | 'falhou' | null;
  email_enviados: number;
}

export interface GabaritoProvaPayload {
  id?: string;
  tipo_prova: string;
  periodo: number;
  semestre: string;
  data_prova: string | null;
  titulo: string | null;
  observacao: string | null;
  qtd_alternativas: number;
  conferido_oficial: boolean;
  questoes: GabaritoProvaQuestao[];
}

export interface GabaritoPublicacaoResultado {
  status: GabaritoStatus;
  publicado_em: string | null;
  notificados: number;
  /** Só preenchido quando algum aluno de fato recebeu o aviso. */
  notificado_em: string | null;
}

/** Resposta do modo `gabarito` da edge function `enviar-campanha-email`. */
export interface GabaritoEmailResultado {
  campanha_id?: string;
  /** O e-mail deste gabarito já tinha saído antes: nada foi reenviado. */
  ja_enviado?: boolean;
  /** Nenhum aluno apto do período: nenhuma campanha criada. */
  sem_destinatarios?: boolean;
  total?: number;
  enviados?: number;
  falhas?: number;
  status?: string;
}

export interface GabaritoEmailPrevia {
  remetente: string;
  destino: string;
  assunto: string;
  html: string;
}
