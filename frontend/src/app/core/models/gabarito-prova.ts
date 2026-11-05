/** Letras possíveis de uma questão objetiva. */
export const LETRAS_GABARITO = ['A', 'B', 'C', 'D', 'E'] as const;
export type LetraGabarito = (typeof LETRAS_GABARITO)[number];

/** Tipos de prova sugeridos no editor (o banco aceita texto livre curto). */
export const TIPOS_PROVA_SUGERIDOS = ['N1', 'N2', 'P1', 'P2', 'Integradora', 'TPI', 'SOI', 'HAM'] as const;

export type GabaritoStatus = 'rascunho' | 'publicado';

/** Nome do caderno quando a prova só tem um (a UI não mostra esse nome). */
export const NOME_CADERNO_UNICO = 'Caderno único';

/** Teto de cadernos por prova (mesmo limite da RPC de salvar). */
export const MAX_CADERNOS_GABARITO = 12;

/** Cadernos de uma prova: o que está impresso na capa (Azul, Caderno B…). */
export interface GabaritoCadernoRef {
  id: string;
  /** Estável: vai em `?caderno=` no link. Não muda ao renomear. */
  slug: string;
  nome: string;
  ordem: number;
}

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
  /** Questões POR caderno (todos têm o mesmo número). */
  total_questoes: number;
  total_anuladas: number;
  cadernos: GabaritoCadernoRef[];
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
  /** Só os nomes: nenhuma letra chega a quem não tem conta. */
  cadernos: GabaritoCadernoRef[];
}

/** Caderno com a sua folha de respostas (`get_gabarito_prova`). */
export interface GabaritoCaderno extends GabaritoCadernoRef {
  questoes: GabaritoProvaQuestao[];
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
  /** 1..12 cadernos, em ordem. Sempre há ao menos um. */
  cadernos: GabaritoCaderno[];
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
  /** Soma dos cadernos (alimenta a barra de progresso). */
  total_questoes: number;
  total_preenchidas: number;
  cadernos: AdminGabaritoCaderno[];
  /** Campanha de e-mail do gabarito (no máximo uma). null = e-mail ainda não saiu. */
  email_campanha_id: string | null;
  email_status: 'enviando' | 'enviada' | 'parcial' | 'falhou' | null;
  email_enviados: number;
}

/** Caderno na lista do admin, com o progresso da folha dele. */
export interface AdminGabaritoCaderno extends GabaritoCadernoRef {
  total_questoes: number;
  total_preenchidas: number;
}

/** Caderno enviado ao salvar. Sem `id` = caderno novo. */
export interface GabaritoCadernoPayload {
  id?: string;
  nome: string;
  questoes: GabaritoProvaQuestao[];
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
  /** Todos os cadernos, sempre: o que não vier é excluído. */
  cadernos: GabaritoCadernoPayload[];
}

/** Retorno de `admin_salvar_gabarito_prova`: os ids dos cadernos para o próximo save. */
export interface GabaritoSalvoResultado {
  id: string;
  slug: string;
  cadernos: GabaritoCadernoRef[];
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
