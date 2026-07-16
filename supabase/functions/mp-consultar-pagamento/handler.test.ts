import { assertEquals, assertExists } from '@std/assert';
import { handleConsultarPagamento } from './handler.ts';
import { FakeDb, fakeFetch, makeDeps } from '../_shared/test/fake.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z');
const INT_ID = '99999999-8888-7777-6666-555555555555';

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

function baseDb(intencao: Record<string, unknown> = {}): FakeDb {
  return new FakeDb({
    profiles: [{ id: 'user-1', email: 'a@b.com' }],
    plano: [{ id: 'pl-sem', slug: 'semestral' }],
    assinatura: [],
    pagamento: [],
    pagamento_intencao: [
      {
        id: INT_ID,
        user_id: 'user-1',
        idempotency_key: '11111111-2222-3333-4444-555555555555',
        mp_payment_id: '999',
        status: 'pendente',
        status_detail: null,
        ...intencao,
      },
    ],
  });
}

function request(body: unknown, auth = 'Bearer jwt'): Request {
  return new Request('https://proj.supabase.co/functions/v1/mp-consultar-pagamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

Deno.test('consultar-pagamento: sem auth → 401; intencao_id inválido → 400', async () => {
  assertEquals(
    (await handleConsultarPagamento(request({ intencao_id: INT_ID }, ''), makeDeps({ db: baseDb() }))).status,
    401,
  );
  assertEquals(
    (
      await handleConsultarPagamento(
        request({ intencao_id: 'nope' }),
        makeDeps({ db: baseDb(), caller: { id: 'user-1' } }),
      )
    ).status,
    400,
  );
});

Deno.test('consultar-pagamento: intenção de outro usuário → 404 (não vaza existência)', async () => {
  const res = await handleConsultarPagamento(
    request({ intencao_id: INT_ID }),
    makeDeps({ db: baseDb(), caller: { id: 'user-2' } }),
  );
  assertEquals(res.status, 404);
});

Deno.test('consultar-pagamento: intenção sem mp_payment_id devolve estado local', async () => {
  const db = baseDb({ mp_payment_id: null, status: 'criada' });
  const res = await handleConsultarPagamento(
    request({ intencao_id: INT_ID }),
    makeDeps({ db, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, 'criada');
});

Deno.test('consultar-pagamento: pago no MP (webhook atrasado) → sync concede acesso e responde approved', async () => {
  const db = baseDb();
  const fetch = fakeFetch([
    {
      match: '/v1/payments/999',
      body: {
        id: 999,
        status: 'approved',
        status_detail: 'accredited',
        external_reference: 'user-1',
        transaction_amount: 240,
        payment_method_id: 'bolbradesco',
        date_approved: '2026-06-24T11:59:00.000Z',
        metadata: { tipo: 'acesso_unico', plano_slug: 'semestral', acesso_meses: 6, intencao_id: INT_ID },
      },
    },
  ]);
  const res = await handleConsultarPagamento(
    request({ intencao_id: INT_ID }),
    makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.status, 'approved');
  assertEquals(out.status_detail, 'accredited');

  const assin = find(db, 'assinatura', (r) => r.mp_payment_id === '999');
  assertExists(assin, 'acesso concedido pela reconciliação');
  assertEquals(find(db, 'pagamento_intencao', (r) => r.id === INT_ID)?.status, 'aprovada');
});

Deno.test('consultar-pagamento: approved com concessão pendente → responde in_process (não finge sucesso)', async () => {
  // Recorrente 'authorized' sobrevive a um cancelamento com falha no MP: o
  // índice único barra o acesso e a resposta NÃO pode ser 'approved' — a UI
  // mostraria sucesso sem o acesso existir. Cada nova consulta reexecuta o
  // sync (reintenta o cancelamento) até conceder.
  const db = baseDb();
  db.rows('assinatura').push({
    id: 'viva',
    user_id: 'user-1',
    status: 'authorized',
    mp_preapproval_id: 'Z',
  });
  const fetch = fakeFetch([
    {
      match: '/v1/payments/999',
      body: {
        id: 999,
        status: 'approved',
        status_detail: 'accredited',
        external_reference: 'user-1',
        transaction_amount: 240,
        metadata: { tipo: 'acesso_unico', plano_slug: 'semestral', acesso_meses: 6, intencao_id: INT_ID },
      },
    },
    { match: '/preapproval/Z', status: 500, body: {} },
  ]);
  const res = await handleConsultarPagamento(
    request({ intencao_id: INT_ID }),
    makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, 'in_process');
  assertEquals(find(db, 'assinatura', (r) => r.mp_payment_id === '999'), undefined);
  assertEquals(find(db, 'pagamento_intencao', (r) => r.id === INT_ID)?.status, 'pendente');
});

Deno.test('consultar-pagamento: MP fora do ar → 502', async () => {
  const db = baseDb();
  const fetch = fakeFetch([{ match: '/v1/payments/999', status: 500, body: {} }]);
  const res = await handleConsultarPagamento(
    request({ intencao_id: INT_ID }),
    makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 502);
});
