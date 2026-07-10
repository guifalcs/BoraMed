import { assertEquals, assertExists } from '@std/assert';
import { mapIntencaoStatus, syncAcessoUnicoPayment } from './mp-payment-sync.ts';
import { FakeDb } from './test/fake.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z');

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

// deno-lint-ignore no-explicit-any
const admin = (db: FakeDb) => db.client() as any;

/** fetch que registra as chamadas (p/ afirmar o PUT de cancelamento no MP). */
function recordingFetch(status = 200) {
  const calls: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
  // deno-lint-ignore no-explicit-any
  const fn = ((input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    calls.push({
      url,
      method: init?.method,
      body: init?.body ? JSON.parse(init.body) : {},
    });
    const ok = status >= 200 && status < 300;
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    } as Response);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

const mpClient = (fn: typeof fetch) => ({ fetch: fn, token: 'TEST-token' });

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

Deno.test('sync approved: concede acesso, cancela o preapproval recorrente anterior NO MP (B5 — inclui legado authorized), grava pagamento e intenção', async () => {
  const db = baseDb({
    assinatura: [{ id: 'old', user_id: 'user-1', status: 'authorized', mp_preapproval_id: 'OLD' }],
  });
  const rec = recordingFetch(200);
  const r = await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(rec.fetch));
  assertEquals(r.handled, true);
  assertEquals(r.status, 'approved');

  // O recorrente anterior (mensal legado authorized) é cancelado NO MP, não só
  // localmente — evita um preapproval órfão que continuaria cobrando.
  const put = rec.calls.find((c) => c.url.includes('/preapproval/OLD'));
  assertExists(put, 'PUT de cancelamento disparado no preapproval anterior');
  assertEquals(put?.method, 'PUT');
  assertEquals(put?.body.status, 'cancelled');

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

Deno.test('sync approved: cancela o preapproval PAUSADO anterior no MP e supera localmente (uma assinatura viva só)', async () => {
  const db = baseDb({
    assinatura: [{ id: 'p', user_id: 'user-1', status: 'paused', mp_preapproval_id: 'PAUS' }],
  });
  const rec = recordingFetch(200);
  await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(rec.fetch));

  const put = rec.calls.find((c) => c.url.includes('/preapproval/PAUS'));
  assertExists(put, 'preapproval pausado é cancelado no MP ao conceder acesso único');
  assertEquals(put?.body.status, 'cancelled');
  assertEquals(find(db, 'assinatura', (x) => x.id === 'p')?.status, 'cancelled');
  assertExists(
    find(db, 'assinatura', (x) => x.mp_payment_id === '12345'),
    'acesso único concedido',
  );
});

Deno.test('sync approved: falha ao cancelar o preapproval no MP mantém a recorrente VIVA/visível e ainda concede o acesso pago', async () => {
  const db = baseDb({
    assinatura: [{ id: 'p', user_id: 'user-1', status: 'paused', mp_preapproval_id: 'PAUS' }],
  });
  const rec = recordingFetch(500); // MP indisponível/erro no cancelamento
  await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(rec.fetch));

  assertExists(rec.calls.find((c) => c.url.includes('/preapproval/PAUS')), 'tentou cancelar no MP');
  assertEquals(
    find(db, 'assinatura', (x) => x.id === 'p')?.status,
    'paused',
    'com falha no MP a recorrente permanece viva/visível (recuperável), nunca órfã escondida',
  );
  assertExists(
    find(db, 'assinatura', (x) => x.mp_payment_id === '12345'),
    'acesso pago é concedido mesmo com falha no cancelamento (tolerante a falha)',
  );
});

Deno.test('sync approved: erro de REDE (fetch lança) no cancelamento não derruba a concessão do acesso', async () => {
  const db = baseDb({
    assinatura: [{ id: 'p', user_id: 'user-1', status: 'paused', mp_preapproval_id: 'PAUS' }],
  });
  // fetch que LANÇA (rede/infra) — diferente de um 5xx com ok:false.
  const throwing = (() => Promise.reject(new Error('network down'))) as typeof fetch;
  const r = await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(throwing));

  assertEquals(r.status, 'approved');
  assertExists(
    find(db, 'assinatura', (x) => x.mp_payment_id === '12345'),
    'o acesso pago é concedido mesmo quando o cancelamento no MP lança exceção',
  );
  assertEquals(
    find(db, 'assinatura', (x) => x.id === 'p')?.status,
    'paused',
    'a recorrente permanece viva/visível quando o cancelamento lança',
  );
});

Deno.test('sync approved: PUT falha com recorrente AUTHORIZED → índice único barra a concessão; intenção fica PENDENTE (nunca finge sucesso)', async () => {
  // Diferente do caso `paused` acima: uma recorrente que sobrevive AUTHORIZED
  // colide com o índice único parcial (1 'authorized' por usuário). O sync não
  // pode marcar a intenção como aprovada sem o acesso existir.
  const db = baseDb({
    assinatura: [{ id: 'old', user_id: 'user-1', status: 'authorized', mp_preapproval_id: 'OLD' }],
  });
  const rec = recordingFetch(500); // MP indisponível no cancelamento
  const r = await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(rec.fetch));

  assertEquals(r.status, 'approved');
  assertEquals(r.concessaoPendente, true, 'sinaliza a concessão pendente para o caller pedir retry');
  assertEquals(r.assinaturaId, null);
  assertEquals(
    find(db, 'assinatura', (x) => x.id === 'old')?.status,
    'authorized',
    'a recorrente permanece viva/visível (não vira órfã escondida)',
  );
  assertEquals(
    find(db, 'assinatura', (x) => x.mp_payment_id === '12345'),
    undefined,
    'o índice único impede a nova authorized enquanto a antiga sobrevive',
  );
  assertExists(find(db, 'pagamento', (x) => x.mp_payment_id === '12345'), 'pagamento registrado (bookkeeping)');
  assertEquals(
    find(db, 'pagamento_intencao', (x) => x.id === 'int-1')?.status,
    'pendente',
    'intenção NÃO vira aprovada — a UI segue acompanhando até o retry conceder',
  );
});

Deno.test('sync approved: retry após a falha do PUT recupera — cancela a recorrente e concede o acesso', async () => {
  const db = baseDb({
    assinatura: [{ id: 'old', user_id: 'user-1', status: 'authorized', mp_preapproval_id: 'OLD' }],
  });
  const down = recordingFetch(500);
  const first = await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(down.fetch));
  assertEquals(first.concessaoPendente, true);

  // MP recuperado: o retry (webhook não-2xx / reconciliação / "Já paguei")
  // reexecuta o MESMO sync — reintenta o PUT e conclui a concessão.
  const up = recordingFetch(200);
  const second = await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW, mpClient(up.fetch));
  assertEquals(second.concessaoPendente, false);
  assertEquals(find(db, 'assinatura', (x) => x.id === 'old')?.status, 'cancelled');
  const nova = find(db, 'assinatura', (x) => x.mp_payment_id === '12345');
  assertExists(nova, 'acesso concedido no retry');
  assertEquals(second.assinaturaId, nova?.id);
  assertEquals(find(db, 'pagamento_intencao', (x) => x.id === 'int-1')?.status, 'aprovada');
});

Deno.test('sync approved sem cliente MP: NÃO cancela silenciosamente um recorrente com preapproval', async () => {
  const db = baseDb({
    assinatura: [{ id: 'p', user_id: 'user-1', status: 'paused', mp_preapproval_id: 'PAUS' }],
  });
  await syncAcessoUnicoPayment(admin(db), payEmbutido(), NOW); // sem mp
  assertEquals(
    find(db, 'assinatura', (x) => x.id === 'p')?.status,
    'paused',
    'sem meio de cancelar no MP, mantém a recorrente visível em vez de virar órfã',
  );
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
