import type { Deps } from '../_shared/deps.ts';
import { mapAuthorizedPaymentStatus, verifyMpSignature } from '../_shared/mp-signature.ts';
import { syncAcessoUnicoPayment } from '../_shared/mp-payment-sync.ts';

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
        // Fallback: o fluxo por redirect/plano não traz external_reference nem
        // (guest) payer_email. Se o mp-vincular já criou a assinatura pela sessão
        // autenticada, resolvemos o usuário pelo registro existente — assim
        // atualizações de status (cancelamento, renovação) seguem funcionando.
        if (!userId) {
          const { data: existente } = await admin
            .from('assinatura')
            .select('user_id')
            .eq('mp_preapproval_id', dataId)
            .maybeSingle();
          userId = (existente?.user_id as string | undefined) ?? null;
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
            mp_preapproval_id: dataId,
            status,
            data_inicio: (sub['date_created'] as string | undefined) ?? null,
            cancelada_em: status === 'cancelled' ? deps.now().toISOString() : null,
          };
          // Só grava plano_id quando resolvido. O preapproval SEM plano associado
          // não traz preapproval_plan_id — preserva o plano_id setado na criação.
          if (planoId) row.plano_id = planoId;
          // Só sobrescreve proxima_cobranca com data FUTURA. O preapproval nasce
          // com next_payment_date = date_created (a 1ª fatura processa assíncrono);
          // gravar essa data ≤ agora apagaria o acesso provisório concedido pelo
          // mp-processar-assinatura e trancaria o assinante no paywall até a 1ª
          // cobrança real (bug visto em produção em 2026-07-09).
          if (nextPayment && new Date(nextPayment).getTime() > deps.now().getTime()) {
            row.proxima_cobranca = nextPayment;
          }
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
        let status = mapAuthorizedPaymentStatus(apStatus);
        // O ap.status fica 'pending'/'recycling' enquanto o MP reagenda retries,
        // mas a recusa real vive no pagamento subjacente (ap.payment.status).
        // Sem isto, cobrança recusada ficava 'pending' eterno no financeiro.
        const apPay = ap['payment'] as
          | { id?: string | number; status?: string; status_detail?: string }
          | undefined;
        if (status !== 'approved' && apPay?.status === 'rejected') status = 'rejected';
        // O líquido (net_received_amount) e o método NÃO vêm no authorized_payment
        // — vivem no pagamento real subjacente (ap.payment.id). Sem buscá-los, as
        // cobranças recorrentes ficavam com liquido_centavos NULL e sumiam das
        // métricas de "Líquido" do financeiro. Buscamos o pagamento real para
        // refletir o líquido corretamente; mantemos o transaction_details do
        // próprio authorized_payment como fallback.
        const apTd = ap['transaction_details'] as { net_received_amount?: number } | undefined;
        let liquidoCentavos =
          apTd?.net_received_amount != null ? Math.round(apTd.net_received_amount * 100) : null;
        let metodo: string | null = null;
        if (apPay?.id != null) {
          const realPay = await mpGet(`/v1/payments/${apPay.id}`);
          if (realPay) {
            const td = realPay['transaction_details'] as
              | { net_received_amount?: number }
              | undefined;
            if (td?.net_received_amount != null) {
              liquidoCentavos = Math.round(td.net_received_amount * 100);
            }
            metodo = (realPay['payment_method_id'] as string | undefined) ?? null;
          }
        }
        await admin.from('pagamento').upsert(
          {
            user_id: assin.user_id,
            assinatura_id: assin.id,
            mp_authorized_payment_id: dataId,
            valor_centavos: ap['transaction_amount']
              ? Math.round(Number(ap['transaction_amount']) * 100)
              : null,
            liquido_centavos: liquidoCentavos,
            status,
            status_detail: apPay?.status_detail ?? null,
            metodo_pagamento: metodo,
            processado_em: (ap['date_created'] as string | undefined) ?? null,
          },
          { onConflict: 'mp_authorized_payment_id' },
        );
      }
    } else if (type === 'payment') {
      const pay = await mpGet(`/v1/payments/${dataId}`);
      if (pay) {
        // B3: trata SOMENTE pagamentos de ACESSO ÚNICO (semestral) — a lógica
        // vive em syncAcessoUnicoPayment, compartilhada com a resposta síncrona
        // do checkout embutido e com a reconciliação (mp-consultar-pagamento).
        // Payments legados (sem metadata.intencao_id) seguem o comportamento
        // original; `cancelled` (Pix/boleto expirado) marca a intenção como
        // expirada quando ela existe. O id vem do dataId (o recurso do MP traz
        // o mesmo valor em pay.id).
        const r = await syncAcessoUnicoPayment(admin, { id: dataId, ...pay }, deps.now(), {
          fetch: deps.fetch,
          token: mpToken,
        });
        if (r.concessaoPendente) {
          // Payment approved cuja concessão falhou (ex.: recorrente 'authorized'
          // sobreviveu a um cancelamento com falha no MP e o índice único barrou
          // o acesso). Responder não-2xx faz o MP REENVIAR — cada retry reexecuta
          // o cancelamento e concede quando o MP voltar (mesmo padrão do B1).
          console.warn('payment approved sem acesso concedido; pedindo retry', { dataId });
          return new Response('grant pending, retry', { status: 409 });
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
