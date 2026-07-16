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
}

export interface AssinaturaPlano {
  nome: string;
  slug: string;
  preco_centavos: number;
  moeda: string;
  frequency: number;
  frequency_type: 'days' | 'months';
  recorrente: boolean;
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
