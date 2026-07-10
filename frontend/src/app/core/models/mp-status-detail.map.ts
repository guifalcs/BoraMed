// Mapa status_detail (Mercado Pago) → mensagem acionável em PT-BR.
// Cobre a tabela oficial de collection-results dos pagamentos com cartão,
// Pix e boleto. `acao` orienta a UI: 'retry' reabre o Brick para nova
// tentativa, 'trocar_metodo' sugere Pix/boleto, 'aguardar' mostra estado
// pendente sem ação do usuário.

export type StatusDetailAcao = 'retry' | 'trocar_metodo' | 'revisar_dados' | 'contatar_banco' | 'aguardar';

export interface StatusDetailInfo {
  titulo: string;
  mensagem: string;
  acao: StatusDetailAcao;
}

const REVISAR: Pick<StatusDetailInfo, 'titulo' | 'acao'> = {
  titulo: 'Revise os dados do cartão',
  acao: 'revisar_dados',
};

const MAPA: Record<string, StatusDetailInfo> = {
  // ---- Recusas de cartão ----
  cc_rejected_insufficient_amount: {
    titulo: 'Saldo ou limite insuficiente',
    mensagem: 'O cartão não tem limite disponível para esta compra. Use outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  cc_rejected_bad_filled_card_number: {
    ...REVISAR,
    mensagem: 'O número do cartão parece incorreto. Confira e digite novamente.',
  },
  cc_rejected_bad_filled_date: {
    ...REVISAR,
    mensagem: 'A data de validade parece incorreta. Confira e digite novamente.',
  },
  cc_rejected_bad_filled_security_code: {
    ...REVISAR,
    mensagem: 'O código de segurança (CVV) parece incorreto. Confira e digite novamente.',
  },
  cc_rejected_bad_filled_other: {
    ...REVISAR,
    mensagem: 'Algum dado do cartão parece incorreto. Revise as informações e tente de novo.',
  },
  cc_rejected_call_for_authorize: {
    titulo: 'Autorização necessária',
    mensagem: 'Seu banco precisa autorizar o pagamento. Ligue para o número no verso do cartão, autorize a compra no Mercado Pago e tente novamente.',
    acao: 'contatar_banco',
  },
  cc_rejected_card_disabled: {
    titulo: 'Cartão inativo',
    mensagem: 'O cartão está bloqueado ou inativo. Ligue para o seu banco para ativá-lo ou use outro cartão.',
    acao: 'contatar_banco',
  },
  cc_rejected_card_error: {
    titulo: 'Não foi possível processar o cartão',
    mensagem: 'Houve um problema com este cartão. Tente novamente ou use outro meio de pagamento.',
    acao: 'retry',
  },
  cc_rejected_duplicated_payment: {
    titulo: 'Pagamento duplicado',
    mensagem: 'Você já fez um pagamento com esse valor há pouco. Se precisar pagar de novo, use outro cartão ou outro meio.',
    acao: 'trocar_metodo',
  },
  cc_rejected_high_risk: {
    titulo: 'Recusado pela análise de segurança',
    mensagem: 'O pagamento não passou na análise de segurança do Mercado Pago. Recomendamos pagar com Pix — a confirmação é imediata.',
    acao: 'trocar_metodo',
  },
  cc_rejected_max_attempts: {
    titulo: 'Muitas tentativas seguidas',
    mensagem: 'Você atingiu o limite de tentativas com este cartão. Aguarde alguns minutos ou use outro meio de pagamento.',
    acao: 'trocar_metodo',
  },
  cc_rejected_invalid_installments: {
    titulo: 'Parcelamento indisponível',
    mensagem: 'Este cartão não aceita o parcelamento escolhido. Tente com menos parcelas.',
    acao: 'revisar_dados',
  },
  cc_rejected_card_type_not_allowed: {
    titulo: 'Função crédito indisponível',
    mensagem: 'Este cartão múltiplo não está habilitado para crédito. Use a função crédito de outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  cc_rejected_3ds_challenge: {
    titulo: 'Verificação não concluída',
    mensagem: 'A verificação adicional do banco não foi concluída. Tente novamente e finalize a confirmação no seu banco.',
    acao: 'retry',
  },
  cc_rejected_3ds_mandatory: {
    titulo: 'Verificação obrigatória',
    mensagem: 'O banco exige verificação adicional que não pôde ser concluída. Tente novamente ou use outro cartão.',
    acao: 'retry',
  },
  cc_rejected_blacklist: {
    titulo: 'Pagamento não autorizado',
    mensagem: 'O pagamento não foi autorizado. Use outro cartão ou outro meio de pagamento.',
    acao: 'trocar_metodo',
  },
  cc_rejected_other_reason: {
    titulo: 'Cartão recusado',
    mensagem: 'O banco emissor recusou o pagamento. Tente novamente ou use outro meio de pagamento.',
    acao: 'retry',
  },
  rejected_by_bank: {
    titulo: 'Recusado pelo banco',
    mensagem: 'O banco recusou a operação. Entre em contato com o banco ou use outro meio de pagamento.',
    acao: 'trocar_metodo',
  },
  // Erros de requisição (token inválido/expirado etc.)
  mp_request_error: {
    titulo: 'Não foi possível processar',
    mensagem: 'Houve um problema ao processar o pagamento. Confira os dados e tente novamente.',
    acao: 'retry',
  },
  // ---- Pendências ----
  pending_contingency: {
    titulo: 'Pagamento em análise',
    mensagem: 'Estamos processando seu pagamento. Em breve você saberá o resultado — avisaremos assim que for aprovado.',
    acao: 'aguardar',
  },
  pending_review_manual: {
    titulo: 'Pagamento em análise',
    mensagem: 'Seu pagamento está em análise. Você será avisado assim que houver o resultado (normalmente em algumas horas).',
    acao: 'aguardar',
  },
  pending_waiting_transfer: {
    titulo: 'Aguardando o Pix',
    mensagem: 'Escaneie o QR Code ou copie o código para pagar. O acesso é liberado na hora após o pagamento.',
    acao: 'aguardar',
  },
  pending_waiting_payment: {
    titulo: 'Aguardando pagamento',
    mensagem: 'Assim que o pagamento for confirmado, seu acesso será liberado automaticamente.',
    acao: 'aguardar',
  },
  pending_challenge: {
    titulo: 'Confirmação do banco',
    mensagem: 'Seu banco pediu uma verificação adicional. Conclua a confirmação para finalizar o pagamento.',
    acao: 'aguardar',
  },
  // ---- Recusa genérica da verificação de cartão da assinatura ----
  card_rejected: {
    titulo: 'Cartão recusado',
    mensagem: 'Não foi possível validar o cartão para a assinatura. Confira os dados ou tente outro cartão.',
    acao: 'retry',
  },
};

const FALLBACK_RECUSA: StatusDetailInfo = {
  titulo: 'Pagamento não aprovado',
  mensagem: 'O pagamento não foi aprovado. Tente novamente ou use outro meio de pagamento.',
  acao: 'retry',
};

/** Mensagem acionável para um status_detail do MP (fallback genérico). */
export function mapStatusDetail(detail: string | null | undefined): StatusDetailInfo {
  if (!detail) return FALLBACK_RECUSA;
  // O backend pode anexar o motivo bruto do MP após ':' (ex.:
  // 'card_rejected:cc_validation_failed') — diagnóstico para o financeiro;
  // a mensagem ao usuário mapeia pelo código-base.
  const base = detail.split(':', 1)[0];
  return MAPA[detail] ?? MAPA[base] ?? FALLBACK_RECUSA;
}
