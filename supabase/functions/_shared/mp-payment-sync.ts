// Sincronização "payment do MP → banco" para pagamentos de ACESSO ÚNICO
// (semestral). Extraída do branch `payment` do mp-webhook para ser usada por
// três caminhos com o MESMO comportamento e idempotência (upsert por
// mp_payment_id):
//   1. mp-webhook (topic payment) — confirmação assíncrona;
//   2. mp-processar-pagamento — resposta síncrona do POST /v1/payments;
//   3. mp-consultar-pagamento — reconciliação ativa ("Já paguei" / polling).
//
// COMPATIBILIDADE LEGADA (regra inviolável): payments criados pelo Checkout
// Pro (redirect) NÃO têm metadata.intencao_id — para eles o comportamento é
// idêntico ao do webhook original (refund/chargeback continuam revogando
// acesso). A atualização de pagamento_intencao só acontece quando o payment
// traz metadata.intencao_id (checkout embutido).

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export interface SyncResult {
  /** false quando o payment não é de acesso único (ou sem external_reference). */
  handled: boolean;
  /** Status do payment no MP (approved, rejected, pending, ...). */
  status: string;
  statusDetail: string | null;
  assinaturaId: string | null;
}

/** Mapeia o status do payment (MP) para o status da pagamento_intencao. */
export function mapIntencaoStatus(mpStatus: string): string {
  switch (mpStatus) {
    case 'approved':
      return 'aprovada';
    case 'rejected':
      return 'recusada';
    // Pix/boleto expirado ou 3DS abandonado (MP cancela após a validade).
    case 'cancelled':
      return 'expirada';
    case 'refunded':
    case 'charged_back':
      return 'cancelada';
    // pending, in_process, authorized e afins.
    default:
      return 'pendente';
  }
}

/**
 * Sincroniza um payment de acesso único: concede/revoga assinatura, upserta
 * `pagamento` e atualiza `pagamento_intencao` (quando houver intencao_id).
 * Idempotente — pode ser chamada pelo webhook e pela resposta síncrona na
 * mesma transação de compra sem duplicar nada.
 */
export async function syncAcessoUnicoPayment(
  admin: AdminClient,
  pay: Record<string, unknown>,
  now: Date,
): Promise<SyncResult> {
  const paymentId = String(pay['id'] ?? '');
  const userId = pay['external_reference'] as string | undefined;
  const status = String(pay['status'] ?? 'pending');
  const statusDetail = (pay['status_detail'] as string | undefined) ?? null;
  const meta = (pay['metadata'] ?? {}) as Record<string, unknown>;

  // Trata SOMENTE pagamentos de ACESSO ÚNICO (semestral). As cobranças de
  // assinatura recorrente são registradas no branch subscription_authorized_payment
  // do webhook — evita registrar a mesma cobrança 2x.
  if (!paymentId || !userId || String(meta['tipo']) !== 'acesso_unico') {
    return { handled: false, status, statusDetail, assinaturaId: null };
  }

  const planoSlug = String(meta['plano_slug'] ?? '');
  const { data: plano } = await admin
    .from('plano')
    .select('id')
    .eq('slug', planoSlug)
    .maybeSingle();

  let assinaturaId: string | null = null;

  if (status === 'approved') {
    // B5: supera outras assinaturas 'authorized' do usuário antes de conceder
    // o acesso único, mantendo no máximo uma ativa.
    await admin
      .from('assinatura')
      .update({ status: 'cancelled', cancelada_em: now.toISOString() })
      .eq('user_id', userId)
      .eq('status', 'authorized');
    // Concede acesso por N meses (sem renovação automática).
    const meses = Number(meta['acesso_meses']) || 6;
    const fim = new Date(now.getTime());
    fim.setMonth(fim.getMonth() + meses);
    const { data: assin } = await admin
      .from('assinatura')
      .upsert(
        {
          user_id: userId,
          plano_id: plano?.id ?? null,
          mp_payment_id: paymentId,
          status: 'authorized',
          data_inicio: (pay['date_approved'] as string | undefined) ?? now.toISOString(),
          proxima_cobranca: fim.toISOString(),
          cancelada_em: null,
        },
        { onConflict: 'mp_payment_id' },
      )
      .select('id')
      .maybeSingle();
    assinaturaId = assin?.id ?? null;
    console.log('acesso único concedido', { paymentId, userId, planoSlug, meses });
  } else if (status === 'refunded' || status === 'charged_back') {
    // C4: estorno/chargeback revoga o acesso concedido por este pagamento.
    const agora = now.toISOString();
    const { data: assin } = await admin
      .from('assinatura')
      .update({ status: 'cancelled', proxima_cobranca: agora, cancelada_em: agora })
      .eq('mp_payment_id', paymentId)
      .select('id')
      .maybeSingle();
    assinaturaId = assin?.id ?? null;
    console.log('acesso único revogado (estorno/chargeback)', { paymentId, status });
  } else {
    // pending/in_process/rejected/cancelled: vincula a assinatura existente, se houver.
    const { data: assin } = await admin
      .from('assinatura')
      .select('id')
      .eq('mp_payment_id', paymentId)
      .maybeSingle();
    assinaturaId = assin?.id ?? null;
  }

  const intencaoId = typeof meta['intencao_id'] === 'string' ? meta['intencao_id'] : null;
  const parcelas = pay['installments'] != null ? Number(pay['installments']) : null;
  const metodo = (pay['payment_method_id'] as string | undefined) ?? null;

  const td = pay['transaction_details'] as { net_received_amount?: number } | undefined;
  await admin.from('pagamento').upsert(
    {
      user_id: userId,
      assinatura_id: assinaturaId,
      mp_payment_id: paymentId,
      valor_centavos: pay['transaction_amount']
        ? Math.round(Number(pay['transaction_amount']) * 100)
        : null,
      liquido_centavos:
        td?.net_received_amount != null ? Math.round(td.net_received_amount * 100) : null,
      status,
      status_detail: statusDetail,
      parcelas,
      intencao_id: intencaoId,
      metodo_pagamento: metodo,
      processado_em: (pay['date_approved'] as string | undefined) ?? null,
    },
    { onConflict: 'mp_payment_id' },
  );

  // Checkout embutido: reflete o resultado na intenção (polling do frontend).
  if (intencaoId) {
    await admin
      .from('pagamento_intencao')
      .update({
        mp_payment_id: paymentId,
        status: mapIntencaoStatus(status),
        status_detail: statusDetail,
        metodo,
        parcelas,
      })
      .eq('id', intencaoId);
  }

  return { handled: true, status, statusDetail, assinaturaId };
}
