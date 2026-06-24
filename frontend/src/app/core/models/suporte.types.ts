export type TicketStatus = 'aberto' | 'em_andamento' | 'resolvido';

export type TicketCategoria =
  | 'problema_tecnico'
  | 'duvida_conteudo'
  | 'assinatura_pagamento'
  | 'melhoria'
  | 'outro';

export interface SuporteTicket {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string;
  categoria: TicketCategoria;
  status: TicketStatus;
  criado_em: string;
  atualizado_em: string;
}

export interface SuporteMensagem {
  id: string;
  ticket_id: string;
  autor_id: string;
  mensagem: string;
  is_admin: boolean;
  criado_em: string;
  anexos: SuporteAnexo[];
}

export interface SuporteAnexo {
  id: string;
  mensagem_id: string;
  ticket_id: string;
  user_id: string;
  storage_path: string;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  criado_em: string;
  url_assinada: string | null;
}

export interface SuporteTicketComMensagens extends SuporteTicket {
  mensagens: SuporteMensagem[];
}

export interface SuporteFaq {
  id: string;
  pergunta: string;
  resposta: string;
  categoria: string | null;
  ordem: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface AdminTicketResumo extends SuporteTicket {
  perfil: {
    nome_completo: string | null;
    email: string;
    avatar_url: string | null;
  };
  total_mensagens: number;
}

export interface AdminTicketDetalhe extends AdminTicketResumo {
  mensagens: SuporteMensagem[];
}

export const CATEGORIA_LABELS: Record<TicketCategoria, string> = {
  problema_tecnico: 'Problema técnico',
  duvida_conteudo: 'Dúvida sobre conteúdo',
  assinatura_pagamento: 'Assinatura / Pagamento',
  melhoria: 'Melhoria',
  outro: 'Outro',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  resolvido: 'Resolvido',
};
