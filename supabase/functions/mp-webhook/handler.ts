import type { Deps } from '../_shared/deps.ts';
import { mapAuthorizedPaymentStatus, verifyMpSignature } from '../_shared/mp-signature.ts';

// Webhook do Mercado Pago — fonte da verdade do status das assinaturas.
// Chamado pelo MP (não pelo app), então NÃO valida JWT; em vez disso valida a
// assinatura HMAC-SHA256 do header x-signature. Deve responder 200 em ≤22s.
// config.toml: verify_jwt = false para esta função.
const MP_API = 'https://api.mercadopago.com';

export async function handleWebhook(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const mpToken = deps.env('MP_ACCESS_TOKEN');
  const webhookSecret = deps.env('MP_WEBHOOK_SECRET');
  if (!mpToken || !webhookSecret) {
    console.error('MP_ACCESS_TOKEN ou MP_WEBHOOK_SECRET ausente');
    return new Response('config error', { status: 500 });
  }

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Algumas notificações trazem dados só na querystring
  }

  // data.id pode vir na querystring (data.id) ou no corpo (data.id)
  const dataFromBody = (body['data'] as { id?: string | number } | undefined)?.id;
  const dataId = String(
    url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? dataFromBody ?? '',
  );
  const type = String(body['type'] ?? url.searchParams.get('type') ?? '');

  // Validar assinatura HMAC
  const ok = await verifyMpSignature(req, dataId, webhookSecret);
  if (!ok) {
    console.error('x-signature inválido', { type, dataId });
    return new Response('invalid signature', { status: 401 });
  }

  if (!dataId) return new Response('ok', { status: 200 });

  const admin = deps.admin();

  const mpGet = async (path: string): Promise<Record<string, unknown> | null> => {
    const res = await deps.fetch(`${MP_API}${path}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!res.ok) {
      console.error('MP GET error:', path, res.status);
      return null;
    }
    return await res.json().catch(() => null);
  };

  try {
    if (type === 'subscription_preapproval') {
      const sub = await mpGet(`/preapproval/${dataId}`);
      if (sub) {
        const status = String(sub['status'] ?? 'pending');
        const nextPayment = (sub['next_payment_date'] as string | undefined) ?? null;
        const externalRef = sub['external_reference'] as string | undefined;
        const payerEmail = sub['payer_email'] as string | undefined;
        const planId = sub['preapproval_plan_id'] as string | undefined;

        // Resolver o usuário: external_reference (id do profile) com fallback
        // por payer_email.
        let userId: string | null = null;
        if (externalRef) {
          const { data: byRef } = await admin
            .from('profiles')
            .select('id')
            .eq('id', externalRef)
            .maybeSingle();
          userId = byRef?.id ?? null;
        }
        if (!userId && payerEmail) {
          const { data: byEmail } = await admin
            .from('profiles')
            .select('id')
            .eq('email', payerEmail)
            .maybeSingle();
          userId = byEmail?.id ?? null;
        }

        // Resolver o plano pelo preapproval_plan_id
        let planoId: string | null = null;
        if (planId) {
          const { data: plano } = await admin
            .from('plano')
            .select('id')
            .eq('mp_preapproval_plan_id', planId)
            .maybeSingle();
          planoId = plano?.id ?? null;
        }

        if (userId) {
          // B5: ao conceder/renovar acesso, supera (cancela) outras assinaturas
          // 'authorized' do usuário para manter no máximo uma ativa. Necessário
          // porque o acesso único (semestral) permanece 'authorized' após
          // expirar; sem isto, o índice único bloquearia a nova concessão.
          if (status === 'authorized') {
            await admin
              .from('assinatura')
              .update({ status: 'cancelled', cancelada_em: deps.now().toISOString() })
              .eq('user_id', userId)
              .eq('status', 'authorized');
          }

          // Não sobrescreve proxima_cobranca com null em cancelamentos: o acesso
          // segue até o fim do período pago (carência). Só atualiza quando o MP
          // informa uma nova data.
          const row: Record<string, unknown> = {
            user_id: userId,
            plano_id: planoId,
            mp_preapproval_id: dataId,
            status,
            data_inicio: (sub['date_created'] as string | undefined) ?? null,
            cancelada_em: status === 'cancelled' ? deps.now().toISOString() : null,
          };
          if (nextPayment) row.proxima_cobranca = nextPayment;
          await admin.from('assinatura').upsert(row, { onConflict: 'mp_preapproval_id' });
          console.log('assinatura upsert', { dataId, status, userId });
        } else {
          console.error('webhook: usuário não resolvido', { dataId, externalRef, payerEmail });
        }
      }
    } else if (type === 'subscription_authorized_payment') {
      const ap = await mpGet(`/authorized_payments/${dataId}`);
      if (ap) {
        const preapprovalId = ap['preapproval_id'] as string | undefined;
        const { data: assin } = preapprovalId
          ? await admin
              .from('assinatura')
              .select('id, user_id')
              .eq('mp_preapproval_id', preapprovalId)
              .maybeSingle()
          : { data: null };
        if (!assin) {
          // B1: a assinatura recorrente ainda não foi vinculada (o vínculo ocorre
          // no retorno do usuário). Responder não-2xx faz o MP reenviar depois,
          // evitando perder o registro da 1ª cobrança.
          console.warn('authorized_payment sem assinatura vinculada; pedindo retry', { dataId });
          return new Response('subscription not linked yet', { status: 409 });
        }
        // Mapeia o status do authorized_payment para o enum de pagamento.
        const apStatus = String(ap['status'] ?? '');
        // D4: além dos estados normais, mapeia estorno/chargeback da parcela
        // recorrente para refletir corretamente no financeiro. Acesso recorrente
        // não é revogado por 1 parcela estornada; quem governa o acesso é o
        // status do preapproval.
        const status = mapAuthorizedPaymentStatus(apStatus);
        const apTd = ap['transaction_details'] as { net_received_amount?: number } | undefined;
        await admin.from('pagamento').upsert(
          {
            user_id: assin.user_id,
            assinatura_id: assin.id,
            mp_authorized_payment_id: dataId,
            valor_centavos: ap['transaction_amount']
              ? Math.round(Number(ap['transaction_amount']) * 100)
              : null,
            liquido_centavos:
              apTd?.net_received_amount != null ? Math.round(apTd.net_received_amount * 100) : null,
            status,
            processado_em: (ap['date_created'] as string | undefined) ?? null,
          },
          { onConflict: 'mp_authorized_payment_id' },
        );
      }
    } else if (type === 'payment') {
      const pay = await mpGet(`/v1/payments/${dataId}`);
      if (pay) {
        const userId = pay['external_reference'] as string | undefined;
        const status = String(pay['status'] ?? 'pending');
        const meta = (pay['metadata'] ?? {}) as Record<string, unknown>;

        // B3: este branch trata SOMENTE pagamentos de ACESSO ÚNICO (semestral).
        // As cobranças de assinatura recorrente são registradas no branch
        // subscription_authorized_payment — evita registrar a mesma cobrança 2x.
        if (userId && String(meta['tipo']) === 'acesso_unico') {
          const planoSlug = String(meta['plano_slug'] ?? '');
          const { data: plano } = await admin
            .from('plano')
            .select('id')
            .eq('slug', planoSlug)
            .maybeSingle();

          let assinaturaId: string | null = null;

          if (status === 'approved') {
            // B5: supera outras assinaturas 'authorized' do usuário antes de
            // conceder o acesso único, mantendo no máximo uma ativa.
            await admin
              .from('assinatura')
              .update({ status: 'cancelled', cancelada_em: deps.now().toISOString() })
              .eq('user_id', userId)
              .eq('status', 'authorized');
            // Concede acesso por N meses (sem renovação automática).
            const meses = Number(meta['acesso_meses']) || 6;
            const fim = deps.now();
            fim.setMonth(fim.getMonth() + meses);
            const { data: assin } = await admin
              .from('assinatura')
              .upsert(
                {
                  user_id: userId,
                  plano_id: plano?.id ?? null,
                  mp_payment_id: dataId,
                  status: 'authorized',
                  data_inicio:
                    (pay['date_approved'] as string | undefined) ?? deps.now().toISOString(),
                  proxima_cobranca: fim.toISOString(),
                  cancelada_em: null,
                },
                { onConflict: 'mp_payment_id' },
              )
              .select('id')
              .maybeSingle();
            assinaturaId = assin?.id ?? null;
            console.log('acesso único concedido', { dataId, userId, planoSlug, meses });
          } else if (status === 'refunded' || status === 'charged_back') {
            // C4: estorno/chargeback revoga o acesso concedido por este pagamento.
            const agora = deps.now().toISOString();
            const { data: assin } = await admin
              .from('assinatura')
              .update({ status: 'cancelled', proxima_cobranca: agora, cancelada_em: agora })
              .eq('mp_payment_id', dataId)
              .select('id')
              .maybeSingle();
            assinaturaId = assin?.id ?? null;
            console.log('acesso único revogado (estorno/chargeback)', { dataId, status });
          } else {
            // pending/in_process/rejected: vincula a uma assinatura existente, se houver.
            const { data: assin } = await admin
              .from('assinatura')
              .select('id')
              .eq('mp_payment_id', dataId)
              .maybeSingle();
            assinaturaId = assin?.id ?? null;
          }

          const td = pay['transaction_details'] as { net_received_amount?: number } | undefined;
          await admin.from('pagamento').upsert(
            {
              user_id: userId,
              assinatura_id: assinaturaId,
              mp_payment_id: dataId,
              valor_centavos: pay['transaction_amount']
                ? Math.round(Number(pay['transaction_amount']) * 100)
                : null,
              liquido_centavos:
                td?.net_received_amount != null ? Math.round(td.net_received_amount * 100) : null,
              status,
              metodo_pagamento: (pay['payment_method_id'] as string | undefined) ?? null,
              processado_em: (pay['date_approved'] as string | undefined) ?? null,
            },
            { onConflict: 'mp_payment_id' },
          );
        }
      }
    }
  } catch (e) {
    console.error('erro processando webhook:', (e as Error).message);
    // Responder 200 mesmo assim evita re-tentativas infinitas em erro transitório
    // de dados; erros reais aparecem no log para inspeção.
  }

  return new Response('ok', { status: 200 });
}
