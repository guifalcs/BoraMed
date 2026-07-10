import type { Deps } from "../_shared/deps.ts";
import { json } from "../_shared/cors.ts";
import { mpGet, mpPut } from "../_shared/mp-api.ts";

// Reconciliação periódica das assinaturas recorrentes (chamada pelo pg_cron,
// não por usuário): cobre os buracos entre o acesso provisório de 3 dias do
// mp-processar-assinatura e a 1ª cobrança real, que o MP processa assíncrono.
//
// Para cada assinatura 'authorized' com preapproval e SEM pagamento aprovado:
//   1. 1ª cobrança aprovada mas webhook perdido → grava o `pagamento` e a
//      `proxima_cobranca` real (mesma escrita do mp-webhook).
//   2. 1ª cobrança RECUSADA → cancela o preapproval no MP (decisão de produto:
//      sem retry de 30 dias cobrando quem já perdeu o acesso), marca a
//      assinatura 'cancelled' (a carência do provisório vira o prazo para
//      assinar de novo) e registra o `pagamento` como rejected com o motivo.
//   3. Nenhuma fatura gerada após 24h → loga alerta (anomalia do lado do MP).
//   4. Preapproval divergente no MP (cancelado/pausado lá, 'authorized' aqui)
//      → sincroniza o status local.
//
// Auth: header x-cron-secret == env CRON_SECRET (verify_jwt = false; quem chama
// é o pg_net, com o secret vindo do Vault).

const JANELA_ALERTA_SEM_FATURA_MS = 24 * 60 * 60 * 1000;
const MAX_POR_EXECUCAO = 100;

interface ApPayment {
  id?: string | number;
  status?: string;
  status_detail?: string;
}

interface AuthorizedPayment {
  id?: string | number;
  status?: string;
  transaction_amount?: number;
  date_created?: string;
  payment?: ApPayment;
}

export interface ReconciliacaoResumo {
  verificadas: number;
  sincronizadas: number;
  recusadas_canceladas: number;
  aguardando: number;
  sem_fatura_24h: number;
  divergencias_sincronizadas: number;
  erros: number;
}

export async function handleReconciliarAssinaturas(
  req: Request,
  deps: Deps,
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, {});
  }

  const cronSecret = deps.env("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET não configurado");
    return json({ error: "config error" }, 500, {});
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "unauthorized" }, 401, {});
  }

  const mpToken = deps.env("MP_ACCESS_TOKEN");
  if (!mpToken) {
    return json({ error: "MP_ACCESS_TOKEN not configured" }, 500, {});
  }
  const mp = { fetch: deps.fetch, token: mpToken };

  const admin = deps.admin();
  const nowMs = deps.now().getTime();

  // Candidatas: recorrentes ativas (acesso único tem mp_preapproval_id nulo).
  const { data: assinaturas, error: selError } = await admin
    .from("assinatura")
    .select(
      "id, user_id, mp_preapproval_id, plano_id, criado_em, proxima_cobranca",
    )
    .eq("status", "authorized")
    .order("criado_em", { ascending: true })
    .limit(MAX_POR_EXECUCAO);
  if (selError) {
    console.error("reconciliação: falha ao listar assinaturas", selError);
    return json({ error: "db error" }, 500, {});
  }
  const recorrentes = (assinaturas ?? []).filter((a) =>
    a.mp_preapproval_id != null
  );

  // Descarta as que já têm pagamento aprovado (nada a reconciliar).
  const ids = recorrentes.map((a) => a.id);
  const { data: pagos } = ids.length
    ? await admin
      .from("pagamento")
      .select("assinatura_id")
      .in("assinatura_id", ids)
      .eq("status", "approved")
    : { data: [] };
  const jaPagas = new Set((pagos ?? []).map((p) => p.assinatura_id));
  const pendentes = recorrentes.filter((a) => !jaPagas.has(a.id));

  const resumo: ReconciliacaoResumo = {
    verificadas: pendentes.length,
    sincronizadas: 0,
    recusadas_canceladas: 0,
    aguardando: 0,
    sem_fatura_24h: 0,
    divergencias_sincronizadas: 0,
    erros: 0,
  };

  for (const assin of pendentes) {
    const preId = assin.mp_preapproval_id as string;
    const busca = await mpGet(
      mp,
      `/authorized_payments/search?preapproval_id=${preId}`,
    );
    if (!busca) {
      resumo.erros++;
      continue;
    }
    const faturas = (busca["results"] as AuthorizedPayment[] | undefined) ?? [];

    const aprovada = faturas.find(
      (f) => f.status === "processed" || f.payment?.status === "approved",
    );
    const recusada = faturas.find((f) => f.payment?.status === "rejected");

    if (aprovada) {
      // Cobrança aprovada sem `pagamento` (webhook perdido): mesma escrita do
      // mp-webhook, mais a proxima_cobranca real vinda do preapproval.
      let liquidoCentavos: number | null = null;
      let metodo: string | null = null;
      if (aprovada.payment?.id != null) {
        const realPay = await mpGet(mp, `/v1/payments/${aprovada.payment.id}`);
        const td = realPay?.["transaction_details"] as
          | { net_received_amount?: number }
          | undefined;
        if (td?.net_received_amount != null) {
          liquidoCentavos = Math.round(td.net_received_amount * 100);
        }
        metodo = (realPay?.["payment_method_id"] as string | undefined) ?? null;
      }
      await admin.from("pagamento").upsert(
        {
          user_id: assin.user_id,
          assinatura_id: assin.id,
          mp_authorized_payment_id: aprovada.id != null
            ? String(aprovada.id)
            : null,
          valor_centavos: aprovada.transaction_amount != null
            ? Math.round(aprovada.transaction_amount * 100)
            : null,
          liquido_centavos: liquidoCentavos,
          status: "approved",
          status_detail: aprovada.payment?.status_detail ?? null,
          metodo_pagamento: metodo,
          processado_em: aprovada.date_created ?? deps.now().toISOString(),
        },
        { onConflict: "mp_authorized_payment_id" },
      );
      const pre = await mpGet(mp, `/preapproval/${preId}`);
      const nextPayment = (pre?.["next_payment_date"] as string | undefined) ??
        null;
      if (nextPayment && new Date(nextPayment).getTime() > nowMs) {
        await admin
          .from("assinatura")
          .update({ proxima_cobranca: nextPayment })
          .eq("id", assin.id);
      }
      console.log("reconciliação: pagamento sincronizado", {
        preId,
        ap: aprovada.id,
      });
      resumo.sincronizadas++;
      continue;
    }

    if (recusada) {
      // 1ª cobrança recusada: cancela o preapproval JÁ (o retry nativo do MP é
      // ~30 dias depois — cobraria alguém que perdeu o acesso no dia 3).
      const cancel = await mpPut(mp, `/preapproval/${preId}`, {
        status: "cancelled",
      });
      if (!cancel.ok) {
        // Mantém 'authorized' para a próxima execução reintentar o cancelamento.
        console.error(
          "reconciliação: falha ao cancelar preapproval",
          preId,
          cancel.status,
        );
        resumo.erros++;
        continue;
      }
      await admin.from("pagamento").upsert(
        {
          user_id: assin.user_id,
          assinatura_id: assin.id,
          mp_authorized_payment_id: recusada.id != null
            ? String(recusada.id)
            : null,
          valor_centavos: recusada.transaction_amount != null
            ? Math.round(recusada.transaction_amount * 100)
            : null,
          liquido_centavos: 0,
          status: "rejected",
          status_detail: recusada.payment?.status_detail ?? null,
          metodo_pagamento: null,
          processado_em: recusada.date_created ?? deps.now().toISOString(),
        },
        { onConflict: "mp_authorized_payment_id" },
      );
      // Cancela local preservando proxima_cobranca: a carência do acesso
      // provisório vira o prazo para o usuário assinar de novo.
      await admin
        .from("assinatura")
        .update({ status: "cancelled", cancelada_em: deps.now().toISOString() })
        .eq("id", assin.id);
      await admin
        .from("pagamento_intencao")
        .update({
          status: "recusada",
          status_detail: recusada.payment?.status_detail ??
            "first_charge_rejected",
        })
        .eq("mp_preapproval_id", preId);
      console.warn(
        "reconciliação: 1ª cobrança recusada, preapproval cancelado",
        {
          preId,
          detail: recusada.payment?.status_detail,
        },
      );
      resumo.recusadas_canceladas++;
      continue;
    }

    if (faturas.length === 0) {
      // Sem fatura: ou o MP ainda vai gerar (normal na 1ª hora), ou o
      // preapproval mudou de status só do lado de lá (divergência).
      const pre = await mpGet(mp, `/preapproval/${preId}`);
      const preStatus = (pre?.["status"] as string | undefined) ?? null;
      if (preStatus && preStatus !== "authorized") {
        await admin
          .from("assinatura")
          .update({
            status: preStatus,
            cancelada_em: preStatus === "cancelled"
              ? deps.now().toISOString()
              : null,
          })
          .eq("id", assin.id);
        console.warn("reconciliação: status divergente sincronizado", {
          preId,
          preStatus,
        });
        resumo.divergencias_sincronizadas++;
        continue;
      }
      const idadeMs = nowMs - new Date(assin.criado_em as string).getTime();
      if (idadeMs > JANELA_ALERTA_SEM_FATURA_MS) {
        console.error("reconciliação: ALERTA assinatura sem fatura há 24h+", {
          preId,
          assinatura_id: assin.id,
          criado_em: assin.criado_em,
        });
        resumo.sem_fatura_24h++;
      } else {
        resumo.aguardando++;
      }
      continue;
    }

    // Fatura existe mas ainda sem desfecho (pending/scheduled): só aguarda.
    resumo.aguardando++;
  }

  return json(resumo, 200, {});
}
