import { assertEquals, assertExists } from '@std/assert';
import { handleWebhook } from './handler.ts';
import { FakeDb, fakeFetch, makeDeps, signedWebhookRequest } from '../_shared/test/fake.ts';

const SECRET = 'whsec_test';
const NOW = new Date('2026-06-24T12:00:00.000Z');

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

Deno.test('webhook: rejeita assinatura HMAC inválida com 401', async () => {
  const db = new FakeDb();
  const req = new Request('https://proj.supabase.co/functions/v1/mp-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'r' },
    body: JSON.stringify({ type: 'payment', data: { id: 'PAY-1' } }),
  });
  const res = await handleWebhook(req, makeDeps({ db }));
  assertEquals(res.status, 401);
});

Deno.test('webhook: método != POST → 405', async () => {
  const res = await handleWebhook(
    new Request('https://proj.supabase.co/functions/v1/mp-webhook', { method: 'GET' }),
    makeDeps({}),
  );
  assertEquals(res.status, 405);
});

Deno.test('webhook: config ausente (sem secret) → 500', async () => {
  const req = await signedWebhookRequest({ secret: SECRET, type: 'payment', dataId: 'PAY-1' });
  const res = await handleWebhook(req, makeDeps({ env: { MP_WEBHOOK_SECRET: '' } }));
  assertEquals(res.status, 500);
});

Deno.test('webhook subscription_preapproval authorized: cria assinatura e supera a anterior (B5)', async () => {
  const db = new FakeDb({
    profiles: [{ id: 'user-1', email: 'a@b.com' }],
    plano: [{ id: 'plano-1', mp_preapproval_plan_id: 'PP-1' }],
    assinatura: [
      { id: 'old', user_id: 'user-1', status: 'authorized', mp_preapproval_id: 'OLD' },
    ],
  });
  const fetch = fakeFetch([
    {
      match: '/preapproval/SUB-1',
      body: {
        status: 'authorized',
        external_reference: 'user-1',
        preapproval_plan_id: 'PP-1',
        next_payment_date: '2026-07-24T12:00:00.000Z',
        date_created: '2026-06-24T12:00:00.000Z',
      },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'subscription_preapproval', dataId: 'SUB-1' });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const old = find(db, 'assinatura', (r) => r.mp_preapproval_id === 'OLD');
  assertEquals(old?.status, 'cancelled', 'assinatura anterior deve ser superada (B5)');

  const nova = find(db, 'assinatura', (r) => r.mp_preapproval_id === 'SUB-1');
  assertExists(nova);
  assertEquals(nova?.status, 'authorized');
  assertEquals(nova?.user_id, 'user-1');
  assertEquals(nova?.plano_id, 'plano-1');
  assertEquals(nova?.proxima_cobranca, '2026-07-24T12:00:00.000Z');
});

Deno.test('webhook subscription_preapproval: resolve usuário por payer_email quando não há external_reference', async () => {
  const db = new FakeDb({
    profiles: [{ id: 'user-2', email: 'maria@b.com' }],
    plano: [],
    assinatura: [],
  });
  const fetch = fakeFetch([
    {
      match: '/preapproval/SUB-2',
      body: { status: 'authorized', payer_email: 'maria@b.com', next_payment_date: '2026-07-24T12:00:00.000Z' },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'subscription_preapproval', dataId: 'SUB-2' });
  await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));

  const nova = find(db, 'assinatura', (r) => r.mp_preapproval_id === 'SUB-2');
  assertEquals(nova?.user_id, 'user-2');
});

Deno.test('webhook subscription_preapproval (sem plano associado): promove pending→authorized e preserva plano_id', async () => {
  // Fluxo novo: mp-criar-assinatura já criou a assinatura 'pending' (preapproval
  // SEM preapproval_plan_id). O webhook deve promover a authorized e NÃO zerar o
  // plano_id (não há preapproval_plan_id para resolver).
  const db = new FakeDb({
    profiles: [{ id: 'user-7', email: 'p@b.com' }],
    plano: [],
    assinatura: [
      { id: 'pend', user_id: 'user-7', plano_id: 'plano-pre', status: 'pending', mp_preapproval_id: 'SUB-7' },
    ],
  });
  const fetch = fakeFetch([
    {
      match: '/preapproval/SUB-7',
      body: {
        status: 'authorized',
        external_reference: 'user-7',
        next_payment_date: '2026-07-24T12:00:00.000Z',
        date_created: '2026-06-24T12:00:00.000Z',
      },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'subscription_preapproval', dataId: 'SUB-7' });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const assin = find(db, 'assinatura', (r) => r.mp_preapproval_id === 'SUB-7');
  assertEquals(assin?.status, 'authorized', 'pending deve virar authorized');
  assertEquals(assin?.user_id, 'user-7');
  assertEquals(assin?.plano_id, 'plano-pre', 'plano_id setado na criação deve ser preservado');
});

Deno.test('webhook authorized_payment sem assinatura vinculada → 409 (pede retry, B1)', async () => {
  const db = new FakeDb({ assinatura: [] });
  const fetch = fakeFetch([
    { match: '/authorized_payments/AP-1', body: { preapproval_id: 'NAO-EXISTE', status: 'processed' } },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'subscription_authorized_payment', dataId: 'AP-1' });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 409);
  assertEquals(db.rows('pagamento').length, 0);
});

Deno.test('webhook authorized_payment processed: registra pagamento approved com líquido', async () => {
  const db = new FakeDb({
    assinatura: [{ id: 'as-1', user_id: 'user-1', mp_preapproval_id: 'PP-X' }],
  });
  const fetch = fakeFetch([
    {
      match: '/authorized_payments/AP-2',
      body: {
        preapproval_id: 'PP-X',
        status: 'processed',
        transaction_amount: 49.9,
        transaction_details: { net_received_amount: 47.5 },
        date_created: '2026-06-24T12:00:00.000Z',
      },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'subscription_authorized_payment', dataId: 'AP-2' });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 200);

  const pag = find(db, 'pagamento', (r) => r.mp_authorized_payment_id === 'AP-2');
  assertExists(pag);
  assertEquals(pag?.status, 'approved');
  assertEquals(pag?.valor_centavos, 4990);
  assertEquals(pag?.liquido_centavos, 4750);
  assertEquals(pag?.assinatura_id, 'as-1');
});

Deno.test('webhook authorized_payment: busca líquido e método no pagamento real subjacente', async () => {
  const db = new FakeDb({
    assinatura: [{ id: 'as-2', user_id: 'user-2', mp_preapproval_id: 'PP-Y' }],
  });
  // O authorized_payment NÃO traz transaction_details; só referencia o pagamento
  // real (payment.id). O líquido e o método vêm de /v1/payments/{id}.
  const fetch = fakeFetch([
    {
      match: '/authorized_payments/AP-3',
      body: {
        preapproval_id: 'PP-Y',
        status: 'processed',
        transaction_amount: 49.9,
        payment: { id: 'PAY-REAL', status: 'approved' },
        date_created: '2026-06-24T12:00:00.000Z',
      },
    },
    {
      match: '/v1/payments/PAY-REAL',
      body: {
        transaction_details: { net_received_amount: 47.32 },
        payment_method_id: 'master',
      },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'subscription_authorized_payment', dataId: 'AP-3' });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 200);

  const pag = find(db, 'pagamento', (r) => r.mp_authorized_payment_id === 'AP-3');
  assertExists(pag);
  assertEquals(pag?.status, 'approved');
  assertEquals(pag?.valor_centavos, 4990);
  assertEquals(pag?.liquido_centavos, 4732);
  assertEquals(pag?.metodo_pagamento, 'master');
});

Deno.test('webhook payment acesso_unico approved: concede acesso por N meses e registra pagamento', async () => {
  const db = new FakeDb({
    plano: [{ id: 'pl-sem', slug: 'semestral' }],
    assinatura: [{ id: 'old2', user_id: 'user-9', status: 'authorized', mp_preapproval_id: 'Z' }],
  });
  const fetch = fakeFetch([
    {
      match: '/v1/payments/PAY-1',
      body: {
        external_reference: 'user-9',
        status: 'approved',
        metadata: { tipo: 'acesso_unico', plano_slug: 'semestral', acesso_meses: 6 },
        transaction_amount: 199.9,
        transaction_details: { net_received_amount: 190 },
        date_approved: '2026-06-24T12:00:00.000Z',
        payment_method_id: 'pix',
      },
    },
    // Cancelamento do preapproval recorrente anterior (B5 — uma assinatura viva só).
    { match: '/preapproval/Z', body: { id: 'Z', status: 'cancelled' } },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'payment', dataId: 'PAY-1' });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  // B5: assinatura recorrente anterior cancelada NO MP e superada localmente.
  assertEquals(find(db, 'assinatura', (r) => r.id === 'old2')?.status, 'cancelled');

  // Acesso único concedido até now + 6 meses (2026-12-24)
  const nova = find(db, 'assinatura', (r) => r.mp_payment_id === 'PAY-1');
  assertExists(nova);
  assertEquals(nova?.status, 'authorized');
  assertEquals(nova?.proxima_cobranca, '2026-12-24T12:00:00.000Z');

  const pag = find(db, 'pagamento', (r) => r.mp_payment_id === 'PAY-1');
  assertEquals(pag?.status, 'approved');
  assertEquals(pag?.valor_centavos, 19990);
  assertEquals(pag?.liquido_centavos, 19000);
  assertEquals(pag?.metodo_pagamento, 'pix');
});

Deno.test('webhook payment acesso_unico refunded: revoga o acesso (proxima_cobranca = agora)', async () => {
  const db = new FakeDb({
    plano: [{ id: 'pl-sem', slug: 'semestral' }],
    assinatura: [
      {
        id: 'au-1',
        user_id: 'user-9',
        status: 'authorized',
        mp_payment_id: 'PAY-1',
        proxima_cobranca: '2026-12-24T12:00:00.000Z',
      },
    ],
  });
  const fetch = fakeFetch([
    {
      match: '/v1/payments/PAY-1',
      body: {
        external_reference: 'user-9',
        status: 'refunded',
        metadata: { tipo: 'acesso_unico', plano_slug: 'semestral' },
        transaction_amount: 199.9,
      },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'payment', dataId: 'PAY-1' });
  await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));

  const assin = find(db, 'assinatura', (r) => r.id === 'au-1');
  assertEquals(assin?.status, 'cancelled');
  assertEquals(assin?.proxima_cobranca, NOW.toISOString(), 'acesso revogado imediatamente');
  assertEquals(find(db, 'pagamento', (r) => r.mp_payment_id === 'PAY-1')?.status, 'refunded');
});

Deno.test('webhook payment sem metadata acesso_unico: ignorado (evita contagem dupla, B3)', async () => {
  const db = new FakeDb({ assinatura: [], pagamento: [] });
  const fetch = fakeFetch([
    {
      match: '/v1/payments/PAY-DUP',
      body: { external_reference: 'user-9', status: 'approved', metadata: {} },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'payment', dataId: 'PAY-DUP' });
  const res = await handleWebhook(req, makeDeps({ db, fetch }));
  assertEquals(res.status, 200);
  assertEquals(db.rows('pagamento').length, 0);
  assertEquals(db.rows('assinatura').length, 0);
});

Deno.test('webhook payment cancelled (checkout embutido): intenção vira expirada', async () => {
  const db = new FakeDb({
    plano: [{ id: 'pl-sem', slug: 'semestral' }],
    assinatura: [],
    pagamento: [],
    pagamento_intencao: [{ id: 'int-9', user_id: 'user-9', status: 'pendente' }],
  });
  const fetch = fakeFetch([
    {
      match: '/v1/payments/PAY-PIX',
      body: {
        external_reference: 'user-9',
        status: 'cancelled',
        status_detail: 'expired',
        payment_method_id: 'pix',
        metadata: { tipo: 'acesso_unico', plano_slug: 'semestral', intencao_id: 'int-9' },
        transaction_amount: 199.9,
      },
    },
  ]);
  const req = await signedWebhookRequest({ secret: SECRET, type: 'payment', dataId: 'PAY-PIX' });
  const res = await handleWebhook(req, makeDeps({ db, fetch, now: NOW }));
  assertEquals(res.status, 200);

  const int = find(db, 'pagamento_intencao', (r) => r.id === 'int-9');
  assertEquals(int?.status, 'expirada');
  assertEquals(int?.mp_payment_id, 'PAY-PIX');
  assertEquals(db.rows('assinatura').length, 0);
  assertEquals(find(db, 'pagamento', (r) => r.mp_payment_id === 'PAY-PIX')?.status, 'cancelled');
});
