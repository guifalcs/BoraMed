import { assertEquals, assertExists } from '@std/assert';
import { mapIntencaoStatus, syncAcessoUnicoPayment } from './mp-payment-sync.ts';
import { FakeDb } from './test/fake.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z');

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

// deno-lint-ignore no-explicit-any
const admin = (db: FakeDb) => db.client() as any;

/** Payment "novo" (checkout embutido): traz metadata.intencao_id. */
function payEmbutido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 12345,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: 'user-1',
    transaction_amount: 199.9,
    transaction_details: { net_received_amount: 189.9 },
    payment_method_id: 'master',
    installments: 6,
    date_approved: '2026-06-24T12:00:00.000Z',
    metadata: {
      tipo: 'acesso_unico',
      plano_slug: 'semestral',
      user_id: 'user-1',
      acesso_meses: 6,
      intencao_id: 'int-1',
    },
    ...overrides,
  };
}

/** Payment LEGADO (Checkout Pro/redirect): sem intencao_id na metadata. */
function payLegado(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = payEmbutido(overrides);
  base.metadata = {
    tipo: 'acesso_unico',
    plano_slug: 'semestral',
    user_id: 'user-1',
    acesso_meses: 6,
    ...(overrides['metadata'] as Record<string, unknown> | undefined),
  };
  return base;
}

function baseDb(extra: Record<string, unknown[]> = {}): FakeDb {
  return new FakeDb({
    profiles: [{ id: 'user-1', email: 'a@b.com' }],
    plano: [{ id: 'plano-sem', slug: 'semestral' }],
    assinatura: [],
    pagamento: [],
    pagamento_intencao: [{ id: 'int-1', user_id: 'user-1', status: 'processando' }],
    ...extra,
  });
}

Deno.test('sync approved: concede acesso, supera assinatura anterior (B5), grava pagamento e intenção', async () => {
  const db = baseDb({
    assinatura: [{ id: 'old', user_id: 'user-1', status: 'authorized', mp_preapproval_id: 'OLD' }],
  });
  const r = await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW);
  assertEquals(r.handled, true);
  assertEquals(r.status, 'approved');

  const old = find(db, 'assinatura', (x) => x.mp_preapproval_id === 'OLD');
  assertEquals(old?.status, 'cancelled', 'assinatura anterior superada (B5)');

  const nova = find(db, 'assinatura', (x) => x.mp_payment_id === '12345');
  assertExists(nova);
  assertEquals(nova?.status, 'authorized');
  assertEquals(nova?.plano_id, 'plano-sem');
  // 6 meses a partir de NOW
  assertEquals(nova?.proxima_cobranca, '2026-12-24T12:00:00.000Z');
  assertEquals(r.assinaturaId, nova?.id);

  const pag = find(db, 'pagamento', (x) => x.mp_payment_id === '12345');
  assertExists(pag);
  assertEquals(pag?.valor_centavos, 19990);
  assertEquals(pag?.liquido_centavos, 18990);
  assertEquals(pag?.status, 'approved');
  assertEquals(pag?.status_detail, 'accredited');
  assertEquals(pag?.parcelas, 6);
  assertEquals(pag?.intencao_id, 'int-1');
  assertEquals(pag?.metodo_pagamento, 'master');

  const int = find(db, 'pagamento_intencao', (x) => x.id === 'int-1');
  assertEquals(int?.status, 'aprovada');
  assertEquals(int?.mp_payment_id, '12345');
  assertEquals(int?.status_detail, 'accredited');
  assertEquals(int?.parcelas, 6);
});

Deno.test('sync approved é idempotente: segunda chamada não duplica assinatura nem pagamento', async () => {
  const db = baseDb();
  await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW);
  await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW);
  assertEquals(db.rows('assinatura').length, 1);
  assertEquals(db.rows('pagamento').length, 1);
});

Deno.test('sync rejected: NÃO concede assinatura; intenção vira recusada com status_detail', async () => {
  const db = baseDb();
  const r = await syncAcessoUnicoPayment(
    admin(db),
    payEmbutido({ status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', date_approved: undefined }),
    NOW,
  );
  assertEquals(r.handled, true);
  assertEquals(db.rows('assinatura').length, 0, 'recusa não cria assinatura');

  const pag = find(db, 'pagamento', (x) => x.mp_payment_id === '12345');
  assertEquals(pag?.status, 'rejected');
  assertEquals(pag?.status_detail, 'cc_rejected_insufficient_amount');

  const int = find(db, 'pagamento_intencao', (x) => x.id === 'int-1');
  assertEquals(int?.status, 'recusada');
  assertEquals(int?.status_detail, 'cc_rejected_insufficient_amount');
});

Deno.test('sync pending (Pix): intenção fica pendente', async () => {
  const db = baseDb();
  await syncAcessoUnicoPayment(
    admin(db),
    payEmbutido({ status: 'pending', status_detail: 'pending_waiting_transfer', payment_method_id: 'pix', installments: undefined, date_approved: undefined }),
    NOW,
  );
  const int = find(db, 'pagamento_intencao', (x) => x.id === 'int-1');
  assertEquals(int?.status, 'pendente');
  assertEquals(int?.metodo, 'pix');
});

Deno.test('sync cancelled (Pix expirado): intenção vira expirada', async () => {
  const db = baseDb();
  await syncAcessoUnicoPayment(
    admin(db),
    payEmbutido({ status: 'cancelled', status_detail: 'expired', date_approved: undefined }),
    NOW,
  );
  const int = find(db, 'pagamento_intencao', (x) => x.id === 'int-1');
  assertEquals(int?.status, 'expirada');
  assertEquals(db.rows('assinatura').length, 0);
});

Deno.test('sync refunded: revoga o acesso concedido pelo pagamento (C4)', async () => {
  const db = baseDb({
    assinatura: [
      { id: 'a1', user_id: 'user-1', status: 'authorized', mp_payment_id: '12345', proxima_cobranca: '2026-12-24T12:00:00.000Z' },
    ],
  });
  const r = await syncAcessoUnicoPayment(admin(db), payEmbutido({ status: 'refunded' }), NOW);
  const assin = find(db, 'assinatura', (x) => x.id === 'a1');
  assertEquals(assin?.status, 'cancelled');
  assertEquals(assin?.proxima_cobranca, NOW.toISOString());
  assertEquals(r.assinaturaId, 'a1');
  const int = find(db, 'pagamento_intencao', (x) => x.id === 'int-1');
  assertEquals(int?.status, 'cancelada');
});

// ---- Compatibilidade com o LEGADO (payments do Checkout Pro, sem intencao_id) ----

Deno.test('sync LEGADO approved: comportamento idêntico ao webhook atual, sem tocar intenção', async () => {
  const db = baseDb();
  const r = await syncAcessoUnicoPayment(admin(db), payLegado(), NOW);
  assertEquals(r.handled, true);

  const nova = find(db, 'assinatura', (x) => x.mp_payment_id === '12345');
  assertExists(nova, 'acesso concedido normalmente');
  assertEquals(nova?.status, 'authorized');

  const pag = find(db, 'pagamento', (x) => x.mp_payment_id === '12345');
  assertExists(pag);
  assertEquals(pag?.intencao_id, null, 'payment legado não referencia intenção');

  const int = find(db, 'pagamento_intencao', (x) => x.id === 'int-1');
  assertEquals(int?.status, 'processando', 'intenção de outro fluxo permanece intacta');
});

Deno.test('sync LEGADO refunded: revoga acesso de pagamento antigo (regressão do webhook)', async () => {
  const db = baseDb({
    assinatura: [
      { id: 'a-leg', user_id: 'user-1', status: 'authorized', mp_payment_id: '12345' },
    ],
  });
  await syncAcessoUnicoPayment(admin(db), payLegado({ status: 'refunded' }), NOW);
  const assin = find(db, 'assinatura', (x) => x.id === 'a-leg');
  assertEquals(assin?.status, 'cancelled');
  assertEquals(assin?.cancelada_em, NOW.toISOString());
});

Deno.test('sync ignora payment sem external_reference ou de outro tipo', async () => {
  const db = baseDb();
  const semRef = await syncAcessoUnicoPayment(
    admin(db),
    payEmbutido({ external_reference: undefined }),
    NOW,
  );
  assertEquals(semRef.handled, false);

  const outroTipo = await syncAcessoUnicoPayment(
    admin(db),
    payEmbutido({ metadata: { tipo: 'outra_coisa' } }),
    NOW,
  );
  assertEquals(outroTipo.handled, false);
  assertEquals(db.rows('pagamento').length, 0);
  assertEquals(db.rows('assinatura').length, 0);
});

Deno.test('mapIntencaoStatus cobre todos os grupos', () => {
  assertEquals(mapIntencaoStatus('approved'), 'aprovada');
  assertEquals(mapIntencaoStatus('rejected'), 'recusada');
  assertEquals(mapIntencaoStatus('cancelled'), 'expirada');
  assertEquals(mapIntencaoStatus('refunded'), 'cancelada');
  assertEquals(mapIntencaoStatus('charged_back'), 'cancelada');
  assertEquals(mapIntencaoStatus('pending'), 'pendente');
  assertEquals(mapIntencaoStatus('in_process'), 'pendente');
  assertEquals(mapIntencaoStatus('authorized'), 'pendente');
});
