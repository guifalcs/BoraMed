// Mapa status_detail (Mercado Pago) → mensagem acionável em PT-BR.
// Cobre a tabela oficial de collection-results dos pagamentos com cartão,
// Pix e boleto. `acao` orienta a UI: 'retry' reabre o Brick para nova
// tentativa, 'trocar_metodo' sugere Pix/boleto, 'aguardar' mostra estado
// pendente sem ação do usuário.
//
// Regra de copy (dados de produção, nov/2026): quem recebe recusa costuma
// repetir o MESMO cartão em segundos, e a 2ª/3ª tentativa vira
// `cc_rejected_high_risk` (antifraude). Por isso as recusas de cartão dizem o
// que fazer em vez de "tente novamente", e quase todas apontam o Pix, que é
// aprovado na hora e não passa pelo antifraude do cartão.

export type StatusDetailAcao =
  | 'retry'
  | 'trocar_metodo'
  | 'revisar_dados'
  | 'contatar_banco'
  | 'aguardar';

export interface StatusDetailInfo {
  titulo: string;
  mensagem: string;
  acao: StatusDetailAcao;
}

const REVISAR: Pick<StatusDetailInfo, 'titulo' | 'acao'> = {
  titulo: 'Revise os dados do cartão',
  acao: 'revisar_dados',
};

const ANTIFRAUDE: StatusDetailInfo = {
  titulo: 'Recusado pela análise de segurança',
  mensagem:
    'O antifraude do Mercado Pago não aprovou este pagamento, e repetir o mesmo cartão costuma dar o mesmo resultado. Pague com Pix: a aprovação é na hora. Se preferir cartão, use outro, de preferência no seu nome e com o CPF do titular.',
  acao: 'trocar_metodo',
};

const MAPA: Record<string, StatusDetailInfo> = {
  // ---- Recusas de cartão ----
  cc_rejected_insufficient_amount: {
    titulo: 'Saldo ou limite insuficiente',
    mensagem:
      'O limite disponível do cartão não cobre esta compra. No parcelado, o cartão precisa ter limite para o valor total, não só para a parcela. Pague com Pix ou use outro cartão.',
    acao: 'trocar_metodo',
  },
  cc_amount_rate_limit_exceeded: {
    titulo: 'Limite de compras do cartão atingido',
    mensagem:
      'Este cartão atingiu o limite de valor ou de compras permitido por agora. Pague com Pix ou use outro cartão.',
    acao: 'trocar_metodo',
  },
  cc_rejected_bad_filled_card_number: {
    ...REVISAR,
    mensagem: 'O número do cartão parece incorreto. Confira e digite novamente.',
  },
  cc_rejected_bad_filled_date: {
    ...REVISAR,
    mensagem:
      'A data de validade está incorreta ou o cartão está vencido. Confira e digite novamente.',
  },
  cc_rejected_bad_filled_security_code: {
    ...REVISAR,
    mensagem:
      'O código de segurança (CVV) parece incorreto. Confira no verso do cartão e digite novamente.',
  },
  cc_rejected_bad_filled_other: {
    ...REVISAR,
    mensagem:
      'Algum dado não confere com o cartão, como o nome do titular ou o CPF. Revise as informações e tente de novo.',
  },
  cc_rejected_call_for_authorize: {
    titulo: 'Seu banco precisa autorizar a compra',
    mensagem:
      'Abra o app do seu banco (ou ligue para o número no verso do cartão), autorize o pagamento para o Mercado Pago e tente de novo. Se preferir, pague com Pix.',
    acao: 'contatar_banco',
  },
  cc_rejected_card_disabled: {
    titulo: 'Cartão bloqueado ou inativo',
    mensagem:
      'O cartão está bloqueado ou ainda não foi ativado. Ative-o no app do seu banco ou use outro cartão. Se preferir, pague com Pix.',
    acao: 'contatar_banco',
  },
  cc_rejected_card_error: {
    titulo: 'Não foi possível processar o cartão',
    mensagem: 'Houve um problema com este cartão. Tente novamente ou pague com Pix.',
    acao: 'retry',
  },
  cc_rejected_duplicated_payment: {
    titulo: 'Pagamento duplicado',
    mensagem:
      'Você já fez um pagamento com esse valor há pouco. Se precisar pagar de novo, use outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  cc_rejected_high_risk: ANTIFRAUDE,
  rejected_high_risk: ANTIFRAUDE,
  cc_rejected_max_attempts: {
    titulo: 'Muitas tentativas com este cartão',
    mensagem:
      'Este cartão atingiu o limite de tentativas por hoje. Pague com Pix ou use outro cartão.',
    acao: 'trocar_metodo',
  },
  cc_rejected_invalid_installments: {
    titulo: 'Parcelamento indisponível',
    mensagem: 'Este cartão não aceita o parcelamento escolhido. Tente com menos parcelas.',
    acao: 'revisar_dados',
  },
  cc_rejected_card_type_not_allowed: {
    titulo: 'Função crédito indisponível',
    mensagem:
      'Este cartão múltiplo não está habilitado para crédito. Use a função crédito de outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  cc_rejected_3ds_challenge: {
    titulo: 'Verificação não concluída',
    mensagem:
      'A verificação adicional do banco não foi concluída. Tente novamente e finalize a confirmação no seu banco, ou pague com Pix.',
    acao: 'retry',
  },
  cc_rejected_3ds_mandatory: {
    titulo: 'Verificação obrigatória',
    mensagem:
      'O banco exige uma verificação adicional que não pôde ser concluída. Tente novamente, use outro cartão ou pague com Pix.',
    acao: 'retry',
  },
  cc_rejected_blacklist: {
    titulo: 'Pagamento não autorizado',
    mensagem: 'O pagamento não foi autorizado. Use outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  cc_rejected_other_reason: {
    titulo: 'Cartão recusado pelo banco',
    mensagem:
      'O banco emissor recusou o pagamento sem informar o motivo. Use outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  cc_rejected_time_out: {
    titulo: 'O banco demorou para responder',
    mensagem: 'Nenhum valor foi cobrado. Tente novamente em alguns minutos ou pague com Pix.',
    acao: 'retry',
  },
  cc_rejected_expired_operation: {
    titulo: 'O banco demorou para responder',
    mensagem: 'Nenhum valor foi cobrado. Tente novamente em alguns minutos ou pague com Pix.',
    acao: 'retry',
  },
  rejected_by_bank: {
    titulo: 'Recusado pelo banco',
    mensagem: 'O banco recusou a operação. Entre em contato com o banco ou pague com Pix.',
    acao: 'trocar_metodo',
  },
  rejected_by_regulations: {
    titulo: 'Pagamento não permitido',
    mensagem:
      'O pagamento foi recusado por regras do banco ou do Mercado Pago. Use outro meio de pagamento.',
    acao: 'trocar_metodo',
  },
  rejected_insufficient_data: {
    titulo: 'Faltaram dados do pagador',
    mensagem: 'Confira se o CPF e o e-mail foram preenchidos corretamente e tente de novo.',
    acao: 'revisar_dados',
  },
  bank_error: {
    titulo: 'Erro no banco',
    mensagem: 'O banco teve um problema ao processar o pagamento. Tente novamente em instantes.',
    acao: 'retry',
  },
  // Erros de requisição (token inválido/expirado etc.)
  mp_request_error: {
    titulo: 'Não foi possível processar',
    mensagem:
      'Houve um problema ao enviar o pagamento. Confira os dados (principalmente o CPF) e tente novamente, ou pague com Pix.',
    acao: 'retry',
  },
  // ---- Pendências ----
  // Cartão em análise antifraude: em produção o desfecho chega em ~1 minuto
  // (aprovado ou cc_rejected_high_risk). Quem fecha a tela antes não vê o
  // motivo — a copy pede para aguardar com a página aberta.
  pending_contingency: {
    titulo: 'Pagamento em análise',
    mensagem:
      'O Mercado Pago está fazendo uma verificação de segurança. Costuma levar cerca de 1 minuto: mantenha esta página aberta para ver o resultado.',
    acao: 'aguardar',
  },
  pending_review_manual: {
    titulo: 'Pagamento em análise',
    mensagem:
      'O Mercado Pago está fazendo uma verificação de segurança. Costuma levar cerca de 1 minuto: mantenha esta página aberta para ver o resultado.',
    acao: 'aguardar',
  },
  pending_waiting_transfer: {
    titulo: 'Aguardando o Pix',
    mensagem:
      'Escaneie o QR Code ou copie o código para pagar. O acesso é liberado na hora após o pagamento.',
    acao: 'aguardar',
  },
  pending_waiting_payment: {
    titulo: 'Aguardando pagamento',
    mensagem: 'Assim que o pagamento for confirmado, seu acesso será liberado automaticamente.',
    acao: 'aguardar',
  },
  pending_challenge: {
    titulo: 'Confirmação do banco',
    mensagem:
      'Seu banco pediu uma verificação adicional. Conclua a confirmação para finalizar o pagamento.',
    acao: 'aguardar',
  },
  // ---- Recusa genérica da verificação de cartão da assinatura ----
  card_rejected: {
    titulo: 'Cartão recusado',
    mensagem:
      'Não foi possível validar o cartão para a assinatura. Confira os dados ou tente outro cartão.',
    acao: 'retry',
  },
  first_charge_rejected: {
    titulo: 'Cartão recusado',
    mensagem: 'A cobrança no cartão não foi aprovada. Tente outro cartão ou pague com Pix.',
    acao: 'trocar_metodo',
  },
};

const FALLBACK_RECUSA: StatusDetailInfo = {
  titulo: 'Pagamento não aprovado',
  mensagem: 'O pagamento não foi aprovado. Tente novamente ou pague com Pix.',
  acao: 'retry',
};

/** Código-base do status_detail (o backend pode anexar o motivo bruto após ':'). */
function codigoBase(detail: string): string {
  return detail.split(':', 1)[0];
}

/** Mensagem acionável para um status_detail do MP (fallback genérico). */
export function mapStatusDetail(detail: string | null | undefined): StatusDetailInfo {
  if (!detail) return FALLBACK_RECUSA;
  // O backend pode anexar o motivo bruto do MP após ':' (ex.:
  // 'card_rejected:cc_validation_failed') — diagnóstico para o financeiro;
  // a mensagem ao usuário mapeia pelo código-base.
  return MAPA[detail] ?? MAPA[codigoBase(detail)] ?? FALLBACK_RECUSA;
}

/**
 * Recusa por falta de limite/saldo: um plano de valor menor (o mensal) pode
 * caber no cartão. Em produção, parte de quem recebeu essa recusa no
 * semestral comprou o mensal minutos depois.
 */
export function recusaPorLimite(detail: string | null | undefined): boolean {
  if (!detail) return false;
  const base = codigoBase(detail);
  return base === 'cc_rejected_insufficient_amount' || base === 'cc_amount_rate_limit_exceeded';
}
