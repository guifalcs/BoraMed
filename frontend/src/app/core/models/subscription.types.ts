export type AssinaturaStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export type PagamentoStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'rejected'
  | 'refunded'
  | 'cancelled'
  | 'charged_back';

export type PlanoTier = 'essencial' | 'avancado';

/**
 * Nível de acesso do usuário — espelha a RPC `nivel_acesso()`. Diferente de
 * `PlanoTier`, é TOTAL: quem não assina é 'gratuito', não ausência de valor.
 */
export type NivelAcesso = 'gratuito' | 'essencial' | 'avancado';

/**
 * Público-alvo de um aviso ou notificação, por nível de acesso. Espelha o CHECK
 * de `avisos.segmento` e o parâmetro `p_segmento` de `admin_enviar_notificacao`.
 */
export type SegmentoAcesso = 'todos' | 'pagantes' | 'gratuitos' | 'essencial' | 'avancado';

export const SEGMENTOS_ACESSO: readonly { valor: SegmentoAcesso; label: string; ajuda: string }[] = [
  { valor: 'todos', label: 'Todos os alunos', ajuda: 'Gratuitos e assinantes.' },
  { valor: 'pagantes', label: 'Somente assinantes', ajuda: 'Essencial e Avançado.' },
  { valor: 'gratuitos', label: 'Somente plano gratuito', ajuda: 'Quem ainda não assinou.' },
  { valor: 'essencial', label: 'Somente Essencial', ajuda: 'Alvo de upsell para o Avançado.' },
  { valor: 'avancado', label: 'Somente Avançado', ajuda: 'Quem já tem tudo liberado.' },
];

/** Payload da RPC `get_status_acesso()`: nível + contador em uma só chamada. */
export interface StatusAcesso {
  nivel: NivelAcesso;
  tentativasLimite: number;
  /** null quando o nível não é gratuito (sem teto). */
  tentativasRestantes: number | null;
  /** null quando o nível não é gratuito (sem teto). */
  tentativasUsadas: number | null;
}

export interface Plano {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  moeda: string;
  frequency: number;
  frequency_type: 'days' | 'months';
  recorrente: boolean;
  ativo: boolean;
  ordem: number;
  tier: PlanoTier;
}

export interface AssinaturaPlano {
  nome: string;
  slug: string;
  preco_centavos: number;
  moeda: string;
  frequency: number;
  frequency_type: 'days' | 'months';
  recorrente: boolean;
  tier: PlanoTier;
}

export interface Assinatura {
  id: string;
  user_id: string;
  plano_id: string | null;
  mp_preapproval_id: string | null;
  mp_payment_id: string | null;
  status: AssinaturaStatus;
  data_inicio: string | null;
  proxima_cobranca: string | null;
  cancelada_em: string | null;
  cortesia: boolean;
  criado_em: string;
  atualizado_em: string;
  plano: AssinaturaPlano | null;
}

export interface Pagamento {
  id: string;
  user_id: string;
  assinatura_id: string | null;
  valor_centavos: number | null;
  moeda: string;
  status: PagamentoStatus;
  metodo_pagamento: string | null;
  processado_em: string | null;
  criado_em: string;
  plano_nome: string | null;
}
