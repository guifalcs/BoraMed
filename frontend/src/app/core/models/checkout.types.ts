// Contratos do checkout embutido (Payment Brick + edges mp-processar-*).
// Os tipos do Brick cobrem apenas o que usamos — o SDK não publica tipos.

/** form_data entregue pelo Payment Brick no onSubmit (subset whitelisted). */
export interface BrickFormData {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string | number;
  installments?: number;
  payer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    identification?: { type?: string; number?: string };
  };
}

export interface BrickSubmitData {
  selectedPaymentMethod: string;
  formData: BrickFormData;
}

/** Controller devolvido pelo bricks.create(); unmount() é obrigatório em SPA. */
export interface BrickController {
  unmount(): void;
}

export interface PixInfo {
  qr_code: string;
  qr_code_base64: string | null;
  ticket_url: string | null;
  expira_em: string | null;
}

export interface BoletoInfo {
  url: string;
  expira_em: string | null;
}

export interface ThreeDsInfo {
  external_resource_url: string;
  creq: string | null;
}

/** Resposta sanitizada da edge mp-processar-pagamento. */
export interface ProcessarPagamentoResponse {
  intencao_id: string;
  payment_id: string | null;
  status: string;
  status_detail: string | null;
  pix?: PixInfo;
  boleto?: BoletoInfo;
  three_ds?: ThreeDsInfo;
}

/** Resposta da edge mp-processar-assinatura. */
export interface ProcessarAssinaturaResponse {
  intencao_id: string;
  status: string;
  status_detail: string | null;
}

/** Resposta da edge mp-consultar-pagamento. */
export interface ConsultarPagamentoResponse {
  status: string;
  status_detail: string | null;
}

export type IntencaoStatus =
  | 'criada'
  | 'processando'
  | 'aprovada'
  | 'pendente'
  | 'recusada'
  | 'expirada'
  | 'cancelada';

/** Linha de pagamento_intencao lida via PostgREST (RLS: própria). */
export interface PagamentoIntencao {
  id: string;
  user_id: string;
  plano_id: string | null;
  tipo: 'acesso_unico' | 'assinatura';
  mp_payment_id: string | null;
  valor_centavos: number;
  metodo: string | null;
  parcelas: number | null;
  status: IntencaoStatus;
  status_detail: string | null;
  expira_em: string | null;
  criado_em: string;
}

export type CheckoutErro =
  | { ok: false; error: string };

export type ProcessarPagamentoResult =
  | ({ ok: true } & ProcessarPagamentoResponse)
  | CheckoutErro;

export type ProcessarAssinaturaResult =
  | ({ ok: true } & ProcessarAssinaturaResponse)
  | CheckoutErro;
