import { assertEquals, assertExists } from "@std/assert";
import { handleWebhook } from "./handler.ts";
import {
  FakeDb,
  fakeFetch,
  makeDeps,
  signedWebhookRequest,
} from "../_shared/test/fake.ts";

const SECRET = "whsec_test";
const NOW = new Date("2026-06-24T12:00:00.000Z");

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

Deno.test("webhook: rejeita assinatura HMAC inválida com 401", async () => {
  const db = new FakeDb();
  const req = new Request("https://proj.supabase.co/functions/v1/mp-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": "ts=1,v1=deadbeef",
      "x-request-id": "r",
    },
    body: JSON.stringify({ type: "payment", data: { id: "PAY-1" } }),
  });
  const res = await handleWebhook(req, makeDeps({ db }));
  assertEquals(res.status, 401);
});

Deno.test("webhook: método != POST → 405", async () => {
  const res = await handleWebhook(
    new Request("https://proj.supabase.co/functions/v1/mp-webhook", {
      method: "GET",
    }),
    makeDeps({}),
  );
  assertEquals(res.status, 405);
});

Deno.test("webhook: config ausente (sem secret) → 500", async () => {
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "payment",
    dataId: "PAY-1",
  });
  const res = await handleWebhook(
    req,
    makeDeps({ env: { MP_WEBHOOK_SECRET: "" } }),
  );
  assertEquals(res.status, 500);
});

Deno.test("webhook subscription_preapproval authorized: cria assinatura e supera a anterior (B5)", async () => {
  const db = new FakeDb({
    profiles: [{ id: "user-1", email: "a@b.com" }],
    plano: [{ id: "plano-1", mp_preapproval_plan_id: "PP-1" }],
    assinatura: [
      {
        id: "old",
        user_id: "user-1",
        status: "authorized",
        mp_preapproval_id: "OLD",
      },
    ],
  });
  const fetch = fakeFetch([
    {
      match: "/preapproval/SUB-1",
      body: {
        status: "authorized",
        external_reference: "user-1",
        preapproval_plan_id: "PP-1",
        next_payment_date: "2026-07-24T12:00:00.000Z",
        date_created: "2026-06-24T12:00:00.000Z",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-1",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const old = find(db, "assinatura", (r) => r.mp_preapproval_id === "OLD");
  assertEquals(
    old?.status,
    "cancelled",
    "assinatura anterior deve ser superada (B5)",
  );

  const nova = find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-1");
  assertExists(nova);
  assertEquals(nova?.status, "authorized");
  assertEquals(nova?.user_id, "user-1");
  assertEquals(nova?.plano_id, "plano-1");
  assertEquals(nova?.proxima_cobranca, "2026-07-24T12:00:00.000Z");
});

Deno.test("webhook subscription_preapproval: resolve usuário por payer_email quando não há external_reference", async () => {
  const db = new FakeDb({
    profiles: [{ id: "user-2", email: "maria@b.com" }],
    plano: [],
    assinatura: [],
  });
  const fetch = fakeFetch([
    {
      match: "/preapproval/SUB-2",
      body: {
        status: "authorized",
        payer_email: "maria@b.com",
        next_payment_date: "2026-07-24T12:00:00.000Z",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-2",
  });
  await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));

  const nova = find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-2");
  assertEquals(nova?.user_id, "user-2");
});

Deno.test("webhook subscription_preapproval (sem plano associado): promove pending→authorized e preserva plano_id", async () => {
  // Fluxo novo: mp-criar-assinatura já criou a assinatura 'pending' (preapproval
  // SEM preapproval_plan_id). O webhook deve promover a authorized e NÃO zerar o
  // plano_id (não há preapproval_plan_id para resolver).
  const db = new FakeDb({
    profiles: [{ id: "user-7", email: "p@b.com" }],
    plano: [],
    assinatura: [
      {
        id: "pend",
        user_id: "user-7",
        plano_id: "plano-pre",
        status: "pending",
        mp_preapproval_id: "SUB-7",
      },
    ],
  });
  const fetch = fakeFetch([
    {
      match: "/preapproval/SUB-7",
      body: {
        status: "authorized",
        external_reference: "user-7",
        next_payment_date: "2026-07-24T12:00:00.000Z",
        date_created: "2026-06-24T12:00:00.000Z",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-7",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const assin = find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-7");
  assertEquals(assin?.status, "authorized", "pending deve virar authorized");
  assertEquals(assin?.user_id, "user-7");
  assertEquals(
    assin?.plano_id,
    "plano-pre",
    "plano_id setado na criação deve ser preservado",
  );
});

Deno.test("webhook subscription_preapproval: next_payment_date ≤ agora NÃO regride o acesso provisório", async () => {
  // Bug de produção (2026-07-09): o preapproval nasce com next_payment_date =
  // date_created; o webhook imediato sobrescrevia a proxima_cobranca provisória
  // (+1 mês) do mp-processar-assinatura e trancava o assinante no paywall.
  const db = new FakeDb({
    profiles: [{ id: "user-9", email: "prov@b.com" }],
    plano: [],
    assinatura: [
      {
        id: "prov",
        user_id: "user-9",
        plano_id: "plano-m",
        status: "authorized",
        mp_preapproval_id: "SUB-9",
        proxima_cobranca: "2026-07-24T12:00:00.000Z",
      },
    ],
  });
  const fetch = fakeFetch([
    {
      match: "/preapproval/SUB-9",
      body: {
        status: "authorized",
        external_reference: "user-9",
        // = agora (NOW): a 1ª fatura ainda não processou no MP.
        next_payment_date: "2026-06-24T12:00:00.000Z",
        date_created: "2026-06-24T12:00:00.000Z",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-9",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const assin = find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-9");
  assertEquals(assin?.status, "authorized");
  assertEquals(
    assin?.proxima_cobranca,
    "2026-07-24T12:00:00.000Z",
    "proxima_cobranca provisória (futura) não pode ser sobrescrita por data ≤ agora",
  );
});

Deno.test("webhook subscription_preapproval: resolve usuário por intencao_id e por user_id:nonce no external_reference", async () => {
  // external_reference único por assinatura (2026-07-14, ticket MP WCS-42784):
  // checkout embutido envia o id da pagamento_intencao; fluxo por redirect
  // envia "<user_id>:<nonce>". Ambos precisam resolver o usuário.
  const INT_ID = "aaaaaaaa-1111-2222-3333-444444444444";
  const db = new FakeDb({
    profiles: [{ id: "user-8", email: "x@b.com" }],
    plano: [],
    assinatura: [],
    pagamento_intencao: [{ id: INT_ID, user_id: "user-8" }],
  });
  const fetch = fakeFetch([
    {
      match: "/preapproval/SUB-INT",
      body: {
        status: "authorized",
        external_reference: INT_ID,
        next_payment_date: "2026-07-24T12:00:00.000Z",
      },
    },
    {
      match: "/preapproval/SUB-NONCE",
      body: {
        status: "authorized",
        external_reference: "user-8:bbbbbbbb-5555-6666-7777-888888888888",
        next_payment_date: "2026-08-24T12:00:00.000Z",
      },
    },
  ]);

  const req1 = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-INT",
  });
  assertEquals(
    (await handleWebhook(req1, makeDeps({ db, fetch, now: NOW }))).status,
    200,
  );
  assertEquals(
    find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-INT")?.user_id,
    "user-8",
    "resolve pelo id da pagamento_intencao",
  );

  // Supera a anterior (B5) e vincula a nova pelo prefixo do external_reference.
  const req2 = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-NONCE",
  });
  assertEquals(
    (await handleWebhook(req2, makeDeps({ db, fetch, now: NOW }))).status,
    200,
  );
  assertEquals(
    find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-NONCE")?.user_id,
    "user-8",
    "resolve pelo user_id antes do ':'",
  );
});

Deno.test("webhook subscription_preapproval cancelled: next_payment_date futura NÃO estende a carência", async () => {
  // Bug de produção (2026-07-10): ao cancelar um preapproval de 1ª cobrança
  // recusada, o next_payment_date vira a data do retry abortado (1 mês à
  // frente); o webhook a gravava como proxima_cobranca e dava 1 mês de
  // carência a quem nunca pagou. Cancelamento preserva a carência do banco.
  const db = new FakeDb({
    profiles: [{ id: "user-9", email: "prov@b.com" }],
    plano: [],
    assinatura: [
      {
        id: "prov",
        user_id: "user-9",
        plano_id: "plano-m",
        status: "cancelled",
        mp_preapproval_id: "SUB-10",
        proxima_cobranca: "2026-06-24T12:00:00.000Z",
      },
    ],
  });
  const fetch = fakeFetch([
    {
      match: "/preapproval/SUB-10",
      body: {
        status: "cancelled",
        external_reference: "user-9",
        // Data do retry abortado: 1 mês à frente do cancelamento.
        next_payment_date: "2026-07-24T12:00:00.000Z",
        date_created: "2026-06-24T11:00:00.000Z",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_preapproval",
    dataId: "SUB-10",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const assin = find(db, "assinatura", (r) => r.mp_preapproval_id === "SUB-10");
  assertEquals(assin?.status, "cancelled");
  assertEquals(
    assin?.proxima_cobranca,
    "2026-06-24T12:00:00.000Z",
    "cancelamento não pode estender a carência com a data do retry abortado",
  );
});

Deno.test("webhook authorized_payment sem assinatura vinculada → 409 (pede retry, B1)", async () => {
  const db = new FakeDb({ assinatura: [] });
  const fetch = fakeFetch([
    {
      match: "/authorized_payments/AP-1",
      body: { preapproval_id: "NAO-EXISTE", status: "processed" },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_authorized_payment",
    dataId: "AP-1",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 409);
  assertEquals(db.rows("pagamento").length, 0);
});

Deno.test("webhook authorized_payment processed: registra pagamento approved com líquido", async () => {
  const db = new FakeDb({
    assinatura: [{ id: "as-1", user_id: "user-1", mp_preapproval_id: "PP-X" }],
  });
  const fetch = fakeFetch([
    {
      match: "/authorized_payments/AP-2",
      body: {
        preapproval_id: "PP-X",
        status: "processed",
        transaction_amount: 49.9,
        transaction_details: { net_received_amount: 47.5 },
        date_created: "2026-06-24T12:00:00.000Z",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_authorized_payment",
    dataId: "AP-2",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 200);

  const pag = find(
    db,
    "pagamento",
    (r) => r.mp_authorized_payment_id === "AP-2",
  );
  assertExists(pag);
  assertEquals(pag?.status, "approved");
  assertEquals(pag?.valor_centavos, 4990);
  assertEquals(pag?.liquido_centavos, 4750);
  assertEquals(pag?.assinatura_id, "as-1");
});

Deno.test("webhook authorized_payment: busca líquido e método no pagamento real subjacente", async () => {
  const db = new FakeDb({
    assinatura: [{ id: "as-2", user_id: "user-2", mp_preapproval_id: "PP-Y" }],
  });
  // O authorized_payment NÃO traz transaction_details; só referencia o pagamento
  // real (payment.id). O líquido e o método vêm de /v1/payments/{id}.
  const fetch = fakeFetch([
    {
      match: "/authorized_payments/AP-3",
      body: {
        preapproval_id: "PP-Y",
        status: "processed",
        transaction_amount: 49.9,
        payment: { id: "PAY-REAL", status: "approved" },
        date_created: "2026-06-24T12:00:00.000Z",
      },
    },
    {
      match: "/v1/payments/PAY-REAL",
      body: {
        transaction_details: { net_received_amount: 47.32 },
        payment_method_id: "master",
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_authorized_payment",
    dataId: "AP-3",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 200);

  const pag = find(
    db,
    "pagamento",
    (r) => r.mp_authorized_payment_id === "AP-3",
  );
  assertExists(pag);
  assertEquals(pag?.status, "approved");
  assertEquals(pag?.valor_centavos, 4990);
  assertEquals(pag?.liquido_centavos, 4732);
  assertEquals(pag?.metodo_pagamento, "master");
});

Deno.test("webhook authorized_payment rejected (renovação): cancela preapproval e revoga acesso na hora", async () => {
  // Decisão de produto (2026-07-31): renovação recusada não espera o retry
  // nativo do MP (~30 dias) nem o cancelamento automático dele após 3
  // parcelas — corta na hora, mesmo racional da recusa da 1ª cobrança.
  const db = new FakeDb({
    assinatura: [{
      id: "as-4",
      user_id: "user-4",
      status: "authorized",
      mp_preapproval_id: "PP-Z",
      proxima_cobranca: "2026-08-27T13:07:00.000Z",
    }],
  });
  const fetch = fakeFetch([
    {
      match: "/authorized_payments/AP-4",
      body: {
        preapproval_id: "PP-Z",
        status: "recycling",
        transaction_amount: 49.9,
        payment: { status: "rejected", status_detail: "insufficient_amount" },
        date_created: "2026-06-24T12:00:00.000Z",
      },
    },
    { match: "/preapproval/PP-Z", body: { id: "PP-Z", status: "cancelled" } },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_authorized_payment",
    dataId: "AP-4",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const pag = find(db, "pagamento", (r) => r.mp_authorized_payment_id === "AP-4");
  assertEquals(pag?.status, "rejected");

  const assin = find(db, "assinatura", (r) => r.id === "as-4");
  assertEquals(assin?.status, "cancelled");
  assertEquals(assin?.cancelada_em, NOW.toISOString());
  assertEquals(
    assin?.proxima_cobranca,
    NOW.toISOString(),
    "acesso revogado na hora, sem esperar a proxima_cobranca antiga",
  );
});

Deno.test("webhook authorized_payment rejected: falha ao cancelar preapproval → 409 pede retry", async () => {
  const db = new FakeDb({
    assinatura: [{
      id: "as-5",
      user_id: "user-5",
      status: "authorized",
      mp_preapproval_id: "PP-W",
      proxima_cobranca: "2026-08-27T13:07:00.000Z",
    }],
  });
  const fetch = fakeFetch([
    {
      match: "/authorized_payments/AP-5",
      body: {
        preapproval_id: "PP-W",
        status: "recycling",
        payment: { status: "rejected" },
      },
    },
    { match: "/preapproval/PP-W", status: 500, body: {} },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "subscription_authorized_payment",
    dataId: "AP-5",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(
    res.status,
    409,
    "não-2xx faz o MP reenviar o webhook e reexecutar o cancelamento",
  );

  const assin = find(db, "assinatura", (r) => r.id === "as-5");
  assertEquals(assin?.status, "authorized", "não revoga sem confirmar o cancelamento no MP");
  assertEquals(assin?.proxima_cobranca, "2026-08-27T13:07:00.000Z");
});

Deno.test("webhook payment acesso_unico approved: concede acesso por N meses e registra pagamento", async () => {
  const db = new FakeDb({
    plano: [{ id: "pl-sem", slug: "semestral" }],
    assinatura: [{
      id: "old2",
      user_id: "user-9",
      status: "authorized",
      mp_preapproval_id: "Z",
    }],
  });
  const fetch = fakeFetch([
    {
      match: "/v1/payments/PAY-1",
      body: {
        external_reference: "user-9",
        status: "approved",
        metadata: {
          tipo: "acesso_unico",
          plano_slug: "semestral",
          acesso_meses: 6,
        },
        transaction_amount: 240,
        transaction_details: { net_received_amount: 228 },
        date_approved: "2026-06-24T12:00:00.000Z",
        payment_method_id: "pix",
      },
    },
    // Cancelamento do preapproval recorrente anterior (B5 — uma assinatura viva só).
    { match: "/preapproval/Z", body: { id: "Z", status: "cancelled" } },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "payment",
    dataId: "PAY-1",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  // B5: assinatura recorrente anterior cancelada NO MP e superada localmente.
  assertEquals(
    find(db, "assinatura", (r) => r.id === "old2")?.status,
    "cancelled",
  );

  // Acesso único concedido até now + 6 meses (2026-12-24)
  const nova = find(db, "assinatura", (r) => r.mp_payment_id === "PAY-1");
  assertExists(nova);
  assertEquals(nova?.status, "authorized");
  assertEquals(nova?.proxima_cobranca, "2026-12-24T12:00:00.000Z");

  const pag = find(db, "pagamento", (r) => r.mp_payment_id === "PAY-1");
  assertEquals(pag?.status, "approved");
  assertEquals(pag?.valor_centavos, 24000);
  assertEquals(pag?.liquido_centavos, 22800);
  assertEquals(pag?.metodo_pagamento, "pix");
});

Deno.test("webhook payment approved com concessão pendente (falha ao cancelar a recorrente) → 409 pede retry", async () => {
  const db = new FakeDb({
    plano: [{ id: "pl-sem", slug: "semestral" }],
    assinatura: [{
      id: "viva",
      user_id: "user-9",
      status: "authorized",
      mp_preapproval_id: "Z",
    }],
    pagamento_intencao: [{
      id: "int-8",
      user_id: "user-9",
      status: "processando",
    }],
  });
  const fetch = fakeFetch([
    {
      match: "/v1/payments/PAY-8",
      body: {
        external_reference: "user-9",
        status: "approved",
        metadata: {
          tipo: "acesso_unico",
          plano_slug: "semestral",
          acesso_meses: 6,
          intencao_id: "int-8",
        },
        transaction_amount: 240,
        date_approved: "2026-06-24T12:00:00.000Z",
      },
    },
    // O cancelamento do preapproval falha (MP 5xx): a recorrente sobrevive
    // 'authorized' e o índice único barra a concessão do acesso único.
    { match: "/preapproval/Z", status: 500, body: {} },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "payment",
    dataId: "PAY-8",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(
    res.status,
    409,
    "não-2xx faz o MP reenviar — o retry conclui a concessão (mesmo padrão do B1)",
  );
  assertEquals(
    find(db, "assinatura", (r) => r.id === "viva")?.status,
    "authorized",
    "recorrente segue visível",
  );
  assertEquals(
    find(db, "assinatura", (r) => r.mp_payment_id === "PAY-8"),
    undefined,
    "acesso não concedido ainda",
  );
  assertEquals(
    find(db, "pagamento_intencao", (r) => r.id === "int-8")?.status,
    "pendente",
    "intenção não finge aprovação",
  );
});

Deno.test("webhook payment acesso_unico refunded: revoga o acesso (proxima_cobranca = agora)", async () => {
  const db = new FakeDb({
    plano: [{ id: "pl-sem", slug: "semestral" }],
    assinatura: [
      {
        id: "au-1",
        user_id: "user-9",
        status: "authorized",
        mp_payment_id: "PAY-1",
        proxima_cobranca: "2026-12-24T12:00:00.000Z",
      },
    ],
  });
  const fetch = fakeFetch([
    {
      match: "/v1/payments/PAY-1",
      body: {
        external_reference: "user-9",
        status: "refunded",
        metadata: { tipo: "acesso_unico", plano_slug: "semestral" },
        transaction_amount: 240,
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "payment",
    dataId: "PAY-1",
  });
  await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));

  const assin = find(db, "assinatura", (r) => r.id === "au-1");
  assertEquals(assin?.status, "cancelled");
  assertEquals(
    assin?.proxima_cobranca,
    NOW.toISOString(),
    "acesso revogado imediatamente",
  );
  assertEquals(
    find(db, "pagamento", (r) => r.mp_payment_id === "PAY-1")?.status,
    "refunded",
  );
});

Deno.test("webhook payment sem metadata acesso_unico: ignorado (evita contagem dupla, B3)", async () => {
  const db = new FakeDb({ assinatura: [], pagamento: [] });
  const fetch = fakeFetch([
    {
      match: "/v1/payments/PAY-DUP",
      body: { external_reference: "user-9", status: "approved", metadata: {} },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "payment",
    dataId: "PAY-DUP",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 200);
  assertEquals(db.rows("pagamento").length, 0);
  assertEquals(db.rows("assinatura").length, 0);
});

Deno.test("webhook payment cancelled (checkout embutido): intenção vira expirada", async () => {
  const db = new FakeDb({
    plano: [{ id: "pl-sem", slug: "semestral" }],
    assinatura: [],
    pagamento: [],
    pagamento_intencao: [{
      id: "int-9",
      user_id: "user-9",
      status: "pendente",
    }],
  });
  const fetch = fakeFetch([
    {
      match: "/v1/payments/PAY-PIX",
      body: {
        external_reference: "user-9",
        status: "cancelled",
        status_detail: "expired",
        payment_method_id: "pix",
        metadata: {
          tipo: "acesso_unico",
          plano_slug: "semestral",
          intencao_id: "int-9",
        },
        transaction_amount: 240,
      },
    },
  ]);
  const req = await signedWebhookRequest({
    secret: SECRET,
    type: "payment",
    dataId: "PAY-PIX",
  });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const int = find(db, "pagamento_intencao", (r) => r.id === "int-9");
  assertEquals(int?.status, "expirada");
  assertEquals(int?.mp_payment_id, "PAY-PIX");
  assertEquals(db.rows("assinatura").length, 0);
  assertEquals(
    find(db, "pagamento", (r) => r.mp_payment_id === "PAY-PIX")?.status,
    "cancelled",
  );
});
