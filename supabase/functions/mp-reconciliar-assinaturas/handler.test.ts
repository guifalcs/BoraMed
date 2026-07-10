import { assertEquals, assertExists } from "@std/assert";
import { handleReconciliarAssinaturas } from "./handler.ts";
import { FakeDb, fakeFetch, makeDeps } from "../_shared/test/fake.ts";

const NOW = new Date("2026-07-10T15:00:00.000Z");
const CRON_ENV = { CRON_SECRET: "segredo-cron" };

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

function request(secret: string | null = "segredo-cron"): Request {
  return new Request(
    "https://proj.supabase.co/functions/v1/mp-reconciliar-assinaturas",
    {
      method: "POST",
      headers: secret ? { "x-cron-secret": secret } : {},
    },
  );
}

/** Assinatura recorrente 'authorized' criada há `horas` horas, sem pagamento. */
function baseDb(horas = 2, extra: Record<string, unknown> = {}): FakeDb {
  const criadoEm = new Date(NOW.getTime() - horas * 60 * 60 * 1000)
    .toISOString();
  return new FakeDb({
    assinatura: [
      {
        id: "as-1",
        user_id: "user-1",
        plano_id: "pl-mensal",
        mp_preapproval_id: "PRE-1",
        status: "authorized",
        criado_em: criadoEm,
        proxima_cobranca: new Date(NOW.getTime() + 24 * 60 * 60 * 1000)
          .toISOString(),
        ...extra,
      },
    ],
    pagamento: [],
    pagamento_intencao: [
      {
        id: "int-1",
        user_id: "user-1",
        mp_preapproval_id: "PRE-1",
        status: "aprovada",
        status_detail: null,
      },
    ],
  });
}

/** fetch fake que registra método+URL de cada chamada. */
function spyFetch(
  routes: Array<{ match: string; status?: number; body?: unknown }>,
) {
  const calls: Array<{ method: string; url: string }> = [];
  const inner = fakeFetch(routes);
  const f = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input) });
    return inner(input, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}

Deno.test("reconciliar: sem/errado x-cron-secret → 401; sem CRON_SECRET no env → 500", async () => {
  const deps = makeDeps({ db: baseDb(), env: CRON_ENV, now: NOW });
  assertEquals(
    (await handleReconciliarAssinaturas(request(null), deps)).status,
    401,
  );
  assertEquals(
    (await handleReconciliarAssinaturas(request("errado"), deps)).status,
    401,
  );
  const semEnv = makeDeps({ db: baseDb(), now: NOW });
  assertEquals(
    (await handleReconciliarAssinaturas(request(), semEnv)).status,
    500,
  );
});

Deno.test("reconciliar: assinatura com pagamento aprovado não consulta o MP", async () => {
  const db = baseDb();
  db.rows("pagamento").push({
    id: "pg-1",
    assinatura_id: "as-1",
    status: "approved",
  });
  // fetch não mockado: qualquer chamada ao MP rejeitaria o teste.
  const res = await handleReconciliarAssinaturas(
    request(),
    makeDeps({ db, env: CRON_ENV, now: NOW }),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.verificadas, 0);
});

Deno.test("reconciliar: cobrança aprovada com webhook perdido → grava pagamento e proxima_cobranca", async () => {
  const db = baseDb();
  const { fetch } = spyFetch([
    {
      match: "/authorized_payments/search?preapproval_id=PRE-1",
      body: {
        results: [
          {
            id: 111,
            status: "processed",
            transaction_amount: 49.9,
            date_created: "2026-07-10T14:30:00.000Z",
            payment: {
              id: 222,
              status: "approved",
              status_detail: "accredited",
            },
          },
        ],
      },
    },
    {
      match: "/v1/payments/222",
      body: {
        transaction_details: { net_received_amount: 47.5 },
        payment_method_id: "master",
      },
    },
    {
      match: "/preapproval/PRE-1",
      body: {
        status: "authorized",
        next_payment_date: "2026-08-10T14:07:44.000Z",
      },
    },
  ]);
  const res = await handleReconciliarAssinaturas(
    request(),
    makeDeps({ db, env: CRON_ENV, now: NOW, fetch }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sincronizadas, 1);

  const pg = find(db, "pagamento", (r) => r.mp_authorized_payment_id === "111");
  assertExists(pg);
  assertEquals(pg?.status, "approved");
  assertEquals(pg?.valor_centavos, 4990);
  assertEquals(pg?.liquido_centavos, 4750);
  assertEquals(pg?.metodo_pagamento, "master");
  const assin = find(db, "assinatura", (r) => r.id === "as-1");
  assertEquals(assin?.status, "authorized");
  assertEquals(assin?.proxima_cobranca, "2026-08-10T14:07:44.000Z");
});

Deno.test("reconciliar: 1ª cobrança recusada → cancela preapproval, assinatura e registra rejected", async () => {
  const db = baseDb();
  const { fetch, calls } = spyFetch([
    {
      match: "/authorized_payments/search?preapproval_id=PRE-1",
      body: {
        results: [
          {
            id: 333,
            status: "recycling",
            transaction_amount: 49.9,
            date_created: "2026-07-10T14:30:00.000Z",
            payment: {
              id: 444,
              status: "rejected",
              status_detail: "cc_rejected_high_risk",
            },
          },
        ],
      },
    },
    { match: "/preapproval/PRE-1", body: { status: "cancelled" } },
  ]);
  const res = await handleReconciliarAssinaturas(
    request(),
    makeDeps({ db, env: CRON_ENV, now: NOW, fetch }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).recusadas_canceladas, 1);

  const put = calls.find((c) =>
    c.method === "PUT" && c.url.includes("/preapproval/PRE-1")
  );
  assertExists(put, "preapproval cancelado no MP (sem retry de 30 dias)");

  const assin = find(db, "assinatura", (r) => r.id === "as-1");
  assertEquals(assin?.status, "cancelled");
  assertExists(assin?.cancelada_em);
  // Acesso revogado NA HORA (sem carência): não houve pagamento e não há
  // canal de aviso — o paywall é o alerta para reassinar com outro cartão.
  assertEquals(assin?.proxima_cobranca, NOW.toISOString());

  const pg = find(db, "pagamento", (r) => r.mp_authorized_payment_id === "333");
  assertEquals(pg?.status, "rejected");
  assertEquals(pg?.status_detail, "cc_rejected_high_risk");

  const int = find(db, "pagamento_intencao", (r) => r.id === "int-1");
  assertEquals(int?.status, "recusada");
  assertEquals(int?.status_detail, "cc_rejected_high_risk");
});

Deno.test("reconciliar: falha ao cancelar no MP mantém assinatura para retry na próxima execução", async () => {
  const db = baseDb();
  const { fetch } = spyFetch([
    {
      match: "/authorized_payments/search?preapproval_id=PRE-1",
      body: {
        results: [
          {
            id: 333,
            status: "recycling",
            payment: { id: 444, status: "rejected" },
          },
        ],
      },
    },
    { match: "/preapproval/PRE-1", status: 500, body: {} },
  ]);
  const res = await handleReconciliarAssinaturas(
    request(),
    makeDeps({ db, env: CRON_ENV, now: NOW, fetch }),
  );
  const out = await res.json();
  assertEquals(out.erros, 1);
  assertEquals(out.recusadas_canceladas, 0);
  assertEquals(
    find(db, "assinatura", (r) => r.id === "as-1")?.status,
    "authorized",
  );
});

Deno.test("reconciliar: sem fatura <24h → aguardando; >24h → alerta", async () => {
  for (
    const [horas, esperado] of [[2, "aguardando"], [
      30,
      "sem_fatura_24h",
    ]] as const
  ) {
    const db = baseDb(horas);
    const { fetch } = spyFetch([
      {
        match: "/authorized_payments/search?preapproval_id=PRE-1",
        body: { results: [] },
      },
      { match: "/preapproval/PRE-1", body: { status: "authorized" } },
    ]);
    const res = await handleReconciliarAssinaturas(
      request(),
      makeDeps({ db, env: CRON_ENV, now: NOW, fetch }),
    );
    const out = await res.json();
    assertEquals(out[esperado], 1, `horas=${horas}`);
    assertEquals(
      find(db, "assinatura", (r) => r.id === "as-1")?.status,
      "authorized",
    );
  }
});

Deno.test("reconciliar: preapproval cancelado só no MP → sincroniza status local", async () => {
  const db = baseDb();
  const { fetch } = spyFetch([
    {
      match: "/authorized_payments/search?preapproval_id=PRE-1",
      body: { results: [] },
    },
    { match: "/preapproval/PRE-1", body: { status: "cancelled" } },
  ]);
  const res = await handleReconciliarAssinaturas(
    request(),
    makeDeps({ db, env: CRON_ENV, now: NOW, fetch }),
  );
  assertEquals((await res.json()).divergencias_sincronizadas, 1);
  const assin = find(db, "assinatura", (r) => r.id === "as-1");
  assertEquals(assin?.status, "cancelled");
  assertExists(assin?.cancelada_em);
});

Deno.test("reconciliar: fatura pendente sem desfecho → aguardando, sem escrita", async () => {
  const db = baseDb();
  const { fetch } = spyFetch([
    {
      match: "/authorized_payments/search?preapproval_id=PRE-1",
      body: { results: [{ id: 555, status: "scheduled", payment: undefined }] },
    },
  ]);
  const res = await handleReconciliarAssinaturas(
    request(),
    makeDeps({ db, env: CRON_ENV, now: NOW, fetch }),
  );
  assertEquals((await res.json()).aguardando, 1);
  assertEquals(db.rows("pagamento").length, 0);
});
