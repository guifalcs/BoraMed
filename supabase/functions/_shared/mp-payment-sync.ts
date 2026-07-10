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

import { mpPut, type MpClientOpts } from './mp-api.ts';

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export interface SyncResult {
  /** false quando o payment não é de acesso único (ou sem usuário resolvível). */
  handled: boolean;
  /** Status do payment no MP (approved, rejected, pending, ...). */
  status: string;
  statusDetail: string | null;
  assinaturaId: string | null;
  /**
   * true quando o payment está approved mas a CONCESSÃO do acesso falhou (ex.:
   * o índice único `assinatura_um_authorized_por_user` barrou o upsert porque
   * uma recorrente 'authorized' sobreviveu a um cancelamento com falha no MP).
   * A intenção fica 'pendente' — NUNCA 'aprovada' sem acesso — e o retry
   * (webhook com não-2xx / reconciliação / "Já paguei") reexecuta o sync, que
   * reintenta o cancelamento e concede assim que o MP se recuperar.
   */
  concessaoPendente: boolean;
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
  mp?: MpClientOpts,
): Promise<SyncResult> {
  const paymentId = String(pay['id'] ?? '');
  const status = String(pay['status'] ?? 'pending');
  const statusDetail = (pay['status_detail'] as string | undefined) ?? null;
  const meta = (pay['metadata'] ?? {}) as Record<string, unknown>;
  // Usuário: metadata.user_id (checkout embutido; external_reference passou a
  // ser a intenção, único por transação). Fallback: payments LEGADOS do
  // Checkout Pro, cujo external_reference era o id do usuário.
  const userId = typeof meta['user_id'] === 'string' && meta['user_id']
    ? (meta['user_id'] as string)
    : (pay['external_reference'] as string | undefined);

  // Trata SOMENTE pagamentos de ACESSO ÚNICO (semestral). As cobranças de
  // assinatura recorrente são registradas no branch subscription_authorized_payment
  // do webhook — evita registrar a mesma cobrança 2x.
  if (!paymentId || !userId || String(meta['tipo']) !== 'acesso_unico') {
    return { handled: false, status, statusDetail, assinaturaId: null, concessaoPendente: false };
  }

  const planoSlug = String(meta['plano_slug'] ?? '');
  const { data: plano } = await admin
    .from('plano')
    .select('id')
    .eq('slug', planoSlug)
    .maybeSingle();

  let assinaturaId: string | null = null;
  let concessaoPendente = false;

  if (status === 'approved') {
    // B5 — "uma assinatura viva só": ao conceder o acesso único, supera as
    // assinaturas anteriores do usuário para no máximo uma ficar ativa.
    //  - Recorrente (com mp_preapproval_id, `authorized` OU `paused`): CANCELA o
    //    preapproval NO MP, senão um recorrente órfão continua vivo (o `paused`
    //    não cobra, mas fica inalcançável e trava o anti-dupla; o `authorized`
    //    ainda cobraria — double-charge latente). Inclui assinantes LEGADOS por
    //    design. Tolerante a falha: a linha só é marcada `cancelled` localmente
    //    quando o cancelamento no MP dá certo — uma falha deixa o preapproval
    //    VISÍVEL (gerenciável em "Minha assinatura" / reconciliação), nunca um
    //    órfão escondido, e nunca derruba a concessão do acesso pago.
    //  - Acesso único anterior (`authorized` sem preapproval): supera localmente
    //    (bookkeeping puro; não há nada a cancelar no MP).
    const { data: anteriores } = await admin
      .from('assinatura')
      .select('id, mp_preapproval_id, status')
      .eq('user_id', userId)
      .in('status', ['authorized', 'paused']);
    for (
      const a of (anteriores ?? []) as Array<
        { id: string; mp_preapproval_id: string | null; status: string }
      >
    ) {
      if (a.mp_preapproval_id) {
        if (!mp) {
          console.error('preapproval recorrente sem cliente MP para cancelar — mantido vivo', {
            assinaturaId: a.id,
          });
          continue;
        }
        try {
          const res = await mpPut(mp, `/preapproval/${a.mp_preapproval_id}`, { status: 'cancelled' });
          if (!res.ok) {
            console.error('falha ao cancelar preapproval ao conceder acesso único — mantido vivo', {
              preapprovalId: a.mp_preapproval_id,
              status: res.status,
            });
            continue;
          }
        } catch (e) {
          // Erro de rede/infra no cancelamento NUNCA derruba a concessão do
          // acesso pago (que acontece adiante): mantém a recorrente viva/visível.
          console.error('erro ao cancelar preapproval ao conceder acesso único — mantido vivo', {
            preapprovalId: a.mp_preapproval_id,
            message: (e as Error).message,
          });
          continue;
        }
      }
      await admin
        .from('assinatura')
        .update({ status: 'cancelled', cancelada_em: now.toISOString() })
        .eq('id', a.id);
    }
    // Concede acesso por N meses (sem renovação automática).
    const meses = Number(meta['acesso_meses']) || 6;
    const fim = new Date(now.getTime());
    fim.setMonth(fim.getMonth() + meses);
    const { data: assin, error: assinError } = await admin
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
    if (assinError || !assin?.id) {
      // Ex.: índice único parcial (1 'authorized' por usuário) quando a
      // recorrente anterior sobreviveu à falha do cancelamento acima. Não
      // finge sucesso: a intenção fica 'pendente' (abaixo) e o retry reexecuta
      // este sync inteiro — inclusive o PUT de cancelamento — até conceder.
      concessaoPendente = true;
      console.error('CRÍTICO: payment approved sem acesso concedido — aguardando retry', {
        paymentId,
        userId,
        message: (assinError as { message?: string } | null)?.message ?? 'upsert sem retorno',
      });
    } else {
      assinaturaId = assin.id;
      console.log('acesso único concedido', { paymentId, userId, planoSlug, meses });
    }
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
  // Concessão pendente NÃO marca 'aprovada' — a UI ficaria em sucesso sem o
  // acesso existir; 'pendente' mantém a tela de acompanhamento até o retry.
  if (intencaoId) {
    await admin
      .from('pagamento_intencao')
      .update({
        mp_payment_id: paymentId,
        status: concessaoPendente ? 'pendente' : mapIntencaoStatus(status),
        status_detail: statusDetail,
        metodo,
        parcelas,
      })
      .eq('id', intencaoId);
  }

  return { handled: true, status, statusDetail, assinaturaId, concessaoPendente };
}
