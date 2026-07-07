import { assertEquals, assertExists } from '@std/assert';
import { handleProcessarPagamento, sanitizePaymentResponse, toMpDate } from './handler.ts';
import { FakeDb, makeDeps } from '../_shared/test/fake.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z');
const ATTEMPT = '11111111-2222-3333-4444-555555555555';

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

function baseDb(extra: Record<string, unknown[]> = {}): FakeDb {
  return new FakeDb({
    profiles: [{ id: 'user-1', email: 'aluno@boramed.com' }],
    plano: [
      {
        id: 'pl-sem',
        slug: 'semestral',
        nome: 'Semestral',
        ativo: true,
        recorrente: false,
        preco_centavos: 19990,
        moeda: 'BRL',
        frequency: 6,
      },
      {
        id: 'pl-men',
        slug: 'mensal',
        nome: 'Mensal',
        ativo: true,
        recorrente: true,
        preco_centavos: 4990,
        moeda: 'BRL',
        frequency: 1,
      },
    ],
    assinatura: [],
    pagamento: [],
    pagamento_intencao: [],
    ...extra,
  });
}

function request(body: unknown, auth = 'Bearer jwt'): Request {
  return new Request('https://proj.supabase.co/functions/v1/mp-processar-pagamento', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      'x-forwarded-for': '200.10.20.30',
    },
    body: JSON.stringify(body),
  });
}

function cardBody(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: ATTEMPT,
    plano_slug: 'semestral',
    form_data: {
      token: 'tok-abc',
      payment_method_id: 'master',
      issuer_id: '24',
      installments: 6,
      payer: {
        email: 'aluno@boramed.com',
        first_name: 'Ana',
        last_name: 'Souza',
        identification: { type: 'CPF', number: '12345678909' },
      },
    },
    ...overrides,
  };
}

/** fetch fake que captura a URL, init (headers/body) e devolve `response`. */
function captureFetch(response: { status?: number; body?: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({ url, init });
    const status = response.status ?? 201;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response.body ?? {}),
      text: () => Promise.resolve(JSON.stringify(response.body ?? {})),
    } as Response);
  }) as typeof fetch;
  return { fn, calls };
}

function approvedPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 999,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: 'user-1',
    transaction_amount: 199.9,
    transaction_details: { net_received_amount: 189.9 },
    payment_method_id: 'master',
    installments: 6,
    date_approved: '2026-06-24T12:00:01.000Z',
    metadata: {
      tipo: 'acesso_unico',
      plano_slug: 'semestral',
      user_id: 'user-1',
      acesso_meses: 6,
      intencao_id: 'pagamento_intencao-fake-1',
    },
    ...overrides,
  };
}

Deno.test('processar-pagamento: sem Authorization → 401', async () => {
  const res = await handleProcessarPagamento(request(cardBody(), ''), makeDeps({ db: baseDb() }));
  assertEquals(res.status, 401);
});

Deno.test('processar-pagamento: JWT inválido → 401', async () => {
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db: baseDb(), caller: null }),
  );
  assertEquals(res.status, 401);
});

Deno.test('processar-pagamento: attempt_id não-UUID → 400', async () => {
  const res = await handleProcessarPagamento(
    request(cardBody({ attempt_id: 'not-a-uuid' })),
    makeDeps({ db: baseDb(), caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 400);
});

Deno.test('processar-pagamento: plano inexistente → 404', async () => {
  const res = await handleProcessarPagamento(
    request(cardBody({ plano_slug: 'nao-existe' })),
    makeDeps({ db: baseDb(), caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 404);
});

Deno.test('processar-pagamento: plano recorrente → 400', async () => {
  const res = await handleProcessarPagamento(
    request(cardBody({ plano_slug: 'mensal' })),
    makeDeps({ db: baseDb(), caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 400);
});

Deno.test('processar-pagamento: acesso ativo → 409 e não chama o MP', async () => {
  const db = baseDb({
    assinatura: [
      { id: 'a1', user_id: 'user-1', status: 'authorized', proxima_cobranca: '2026-12-01T00:00:00.000Z' },
    ],
  });
  const { fn, calls } = captureFetch({ body: {} });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 409);
  assertEquals(calls.length, 0);
  assertEquals(db.rows('pagamento_intencao').length, 0);
});

Deno.test('processar-pagamento: mensal pausado NÃO bloqueia a compra do semestral (pagamento único)', async () => {
  // paused é anti-dupla só no fluxo recorrente; comprar o semestral (one-time,
  // sem preapproval) é uma via legítima de o pausado voltar a ter acesso.
  const db = baseDb({
    assinatura: [
      {
        id: 'a1',
        user_id: 'user-1',
        status: 'paused',
        mp_preapproval_id: 'PRE-P',
        proxima_cobranca: '2026-12-01T00:00:00.000Z',
      },
    ],
  });
  const { fn, calls } = captureFetch({ body: approvedPayment() });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200, 'não deve barrar em 409 por causa do paused');
  assertEquals(calls.length >= 1, true, 'chega a chamar o MP (não barrado no anti-dupla)');
});

Deno.test('processar-pagamento: rate limit 5/15min → 429', async () => {
  const recentes = Array.from({ length: 5 }, (_, i) => ({
    id: `int-${i}`,
    user_id: 'user-1',
    idempotency_key: `00000000-0000-0000-0000-00000000000${i}`,
    criado_em: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
  }));
  const db = baseDb({ pagamento_intencao: recentes });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 429);
});

Deno.test('processar-pagamento: intenções antigas (>15min) não contam no rate limit', async () => {
  const antigas = Array.from({ length: 5 }, (_, i) => ({
    id: `int-${i}`,
    user_id: 'user-1',
    idempotency_key: `00000000-0000-0000-0000-00000000000${i}`,
    criado_em: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
  }));
  const db = baseDb({ pagamento_intencao: antigas });
  const { fn } = captureFetch({ body: approvedPayment({ metadata: undefined }) });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
});

Deno.test('processar-pagamento: installments fora de 1–6 → 400', async () => {
  for (const installments of [0, 7, 1.5]) {
    const body = cardBody();
    (body.form_data as { installments?: number }).installments = installments;
    const res = await handleProcessarPagamento(
      request(body),
      makeDeps({ db: baseDb(), caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
    );
    assertEquals(res.status, 400, `installments=${installments}`);
  }
});

Deno.test('processar-pagamento: attempt_id de OUTRO usuário → 409 (anti-replay)', async () => {
  const db = baseDb({
    pagamento_intencao: [
      { id: 'int-x', user_id: 'user-2', idempotency_key: ATTEMPT, criado_em: NOW.toISOString() },
    ],
  });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 409);
});

Deno.test('processar-pagamento aprovado (cartão): preço DO BANCO no body, idempotency no header, acesso concedido', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({ body: approvedPayment() });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);

  // Payload enviado ao MP
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, 'https://api.mercadopago.com/v1/payments');
  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(sent.transaction_amount, 199.9, 'preço vem do banco, nunca do cliente');
  assertEquals(sent.token, 'tok-abc');
  assertEquals(sent.installments, 6);
  assertEquals(sent.statement_descriptor, 'BORAMED');
  assertEquals(sent.external_reference, 'user-1');
  assertEquals(sent.three_d_secure_mode, 'optional');
  assertEquals(sent.binary_mode, false);
  assertEquals(sent.metadata.tipo, 'acesso_unico');
  assertExists(sent.metadata.intencao_id);
  assertEquals(sent.additional_info.items[0].unit_price, 199.9);
  assertEquals(sent.additional_info.ip_address, '200.10.20.30');
  assertEquals(sent.notification_url, 'https://proj.supabase.co/functions/v1/mp-webhook');
  const headers = calls[0].init?.headers as Record<string, string>;
  assertEquals(headers['X-Idempotency-Key'], ATTEMPT);

  // Resposta sanitizada
  const out = await res.json();
  assertEquals(out.status, 'approved');
  assertEquals(out.payment_id, '999');
  assertExists(out.intencao_id);
  assertEquals(out.pix, undefined);

  // Banco sincronizado
  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'aprovada');
  assertEquals(int?.valor_centavos, 19990, 'snapshot do preço do banco');
  const assin = find(db, 'assinatura', (r) => r.mp_payment_id === '999');
  assertExists(assin, 'acesso concedido na resposta síncrona');
  assertEquals(assin?.status, 'authorized');
  const pag = find(db, 'pagamento', (r) => r.mp_payment_id === '999');
  assertEquals(pag?.parcelas, 6);
});

Deno.test('processar-pagamento: SUPABASE_URL http (stack local) → payload SEM notification_url', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({ body: approvedPayment() });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({
      db,
      fetch: fn,
      now: NOW,
      caller: { id: 'user-1', email: 'aluno@boramed.com' },
      env: { SUPABASE_URL: 'http://127.0.0.1:54321' },
    }),
  );
  assertEquals(res.status, 200);
  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(
    sent.notification_url,
    undefined,
    'MP rejeita notification_url não-https; no local o campo é omitido',
  );
  await res.body?.cancel();
});

Deno.test('processar-pagamento recusado: intenção recusada, SEM assinatura, resposta com status_detail', async () => {
  const db = baseDb();
  const { fn } = captureFetch({
    body: approvedPayment({ status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', date_approved: undefined }),
  });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.status, 'rejected');
  assertEquals(out.status_detail, 'cc_rejected_insufficient_amount');
  assertEquals(db.rows('assinatura').length, 0);
  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'recusada');
});

Deno.test('processar-pagamento Pix: date_of_expiration enviado, resposta traz QR e intenção fica pendente', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({
    body: approvedPayment({
      status: 'pending',
      status_detail: 'pending_waiting_transfer',
      payment_method_id: 'pix',
      installments: undefined,
      date_approved: undefined,
      date_of_expiration: '2026-06-24T09:30:00.000-03:00',
      point_of_interaction: {
        transaction_data: {
          qr_code: 'PIXCODE',
          qr_code_base64: 'QkFTRTY0',
          ticket_url: 'https://mp.com/pix/1',
        },
      },
    }),
  });
  const body = {
    attempt_id: ATTEMPT,
    plano_slug: 'semestral',
    form_data: {
      payment_method_id: 'pix',
      payer: { email: 'aluno@boramed.com', identification: { type: 'CPF', number: '12345678909' } },
    },
  };
  const res = await handleProcessarPagamento(
    request(body),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);

  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(sent.installments, 1);
  assertEquals(sent.token, undefined);
  // NOW 12:00Z − 3h = 09:00 -03:00; +30min = 09:30 -03:00
  assertEquals(sent.date_of_expiration, '2026-06-24T09:30:00.000-03:00');

  const out = await res.json();
  assertEquals(out.status, 'pending');
  assertEquals(out.pix.qr_code, 'PIXCODE');
  assertEquals(out.pix.qr_code_base64, 'QkFTRTY0');
  assertEquals(out.pix.expira_em, '2026-06-24T09:30:00.000-03:00');

  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'pendente');
  assertEquals(int?.expira_em, '2026-06-24T12:30:00.000Z', 'expira_em normalizado em UTC');
  assertEquals(db.rows('assinatura').length, 0, 'Pix pendente não concede acesso');
});

Deno.test('processar-pagamento boleto: resposta traz url do boleto', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({
    body: approvedPayment({
      status: 'pending',
      status_detail: 'pending_waiting_payment',
      payment_method_id: 'bolbradesco',
      installments: undefined,
      date_approved: undefined,
      date_of_expiration: '2026-06-27T09:00:00.000-03:00',
      transaction_details: { external_resource_url: 'https://mp.com/boleto/1' },
    }),
  });
  const body = {
    attempt_id: ATTEMPT,
    plano_slug: 'semestral',
    form_data: {
      payment_method_id: 'bolbradesco',
      payer: { email: 'aluno@boramed.com', identification: { type: 'CPF', number: '12345678909' } },
    },
  };
  const res = await handleProcessarPagamento(
    request(body),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  const sent = JSON.parse(String(calls[0].init?.body));
  // Boleto: +3 dias
  assertEquals(sent.date_of_expiration, '2026-06-27T09:00:00.000-03:00');
  const out = await res.json();
  assertEquals(out.boleto.url, 'https://mp.com/boleto/1');
});

Deno.test('processar-pagamento boleto: endereço do Brick repassado ao MP (whitelist, exigência do boleto)', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({
    body: approvedPayment({
      status: 'pending',
      status_detail: 'pending_waiting_payment',
      payment_method_id: 'bolbradesco',
      date_approved: undefined,
      transaction_details: { external_resource_url: 'https://mp.com/boleto/1' },
    }),
  });
  const body = {
    attempt_id: ATTEMPT,
    plano_slug: 'semestral',
    form_data: {
      payment_method_id: 'bolbradesco',
      payer: {
        email: 'aluno@boramed.com',
        first_name: 'Ana',
        last_name: 'Souza',
        identification: { type: 'CPF', number: '12345678909' },
        address: {
          zip_code: '01310-100',
          street_name: 'Av. Paulista',
          street_number: 1000,
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          federal_unit: 'SP',
          campo_estranho: 'nao-deve-passar',
        },
      },
    },
  };
  const res = await handleProcessarPagamento(
    request(body),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(sent.payer.address.zip_code, '01310-100');
  assertEquals(sent.payer.address.street_number, '1000', 'normalizado para string');
  assertEquals(sent.payer.address.federal_unit, 'SP');
  assertEquals(sent.payer.address.campo_estranho, undefined, 'whitelist estrita');
  assertEquals(sent.payer.identification.number, '12345678909');
});

Deno.test('processar-pagamento cartão: sem endereço no form, payer não leva address', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({ body: approvedPayment() });
  await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(sent.payer.address, undefined);
});

Deno.test('processar-pagamento replay do MESMO usuário: reconsulta o payment e não cria outro', async () => {
  const db = baseDb({
    pagamento_intencao: [
      {
        id: 'int-1',
        user_id: 'user-1',
        idempotency_key: ATTEMPT,
        mp_payment_id: '999',
        status: 'pendente',
        criado_em: NOW.toISOString(),
      },
    ],
  });
  const { fn, calls } = captureFetch({ status: 200, body: approvedPayment({ metadata: { tipo: 'acesso_unico', plano_slug: 'semestral', acesso_meses: 6, intencao_id: 'int-1' } }) });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, 'https://api.mercadopago.com/v1/payments/999');
  assertEquals(calls[0].init?.method ?? 'GET', 'GET', 'reconsulta, não recria');
  const out = await res.json();
  assertEquals(out.status, 'approved');
  const int = find(db, 'pagamento_intencao', (r) => r.id === 'int-1');
  assertEquals(int?.status, 'aprovada');
});

Deno.test('processar-pagamento: erro 400 do MP → 200 rejected mp_request_error (sem vazar body cru)', async () => {
  const db = baseDb();
  const { fn } = captureFetch({ status: 400, body: { message: 'invalid token', cause: [] } });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.status, 'rejected');
  assertEquals(out.status_detail, 'mp_request_error');
  assertEquals(out.message, undefined);
  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'recusada');
});

Deno.test('processar-pagamento: erro 500 do MP → 502 e intenção volta a criada (retry possível)', async () => {
  const db = baseDb();
  const { fn } = captureFetch({ status: 500, body: {} });
  const res = await handleProcessarPagamento(
    request(cardBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 502);
  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'criada');
});

Deno.test('sanitizePaymentResponse: 3DS challenge exposto', () => {
  const out = sanitizePaymentResponse('int-1', {
    id: 5,
    status: 'pending',
    status_detail: 'pending_challenge',
    three_ds_info: { external_resource_url: 'https://acs.bank.com', creq: 'abc123' },
  }) as { three_ds?: { external_resource_url: string; creq: string } };
  assertEquals(out.three_ds?.external_resource_url, 'https://acs.bank.com');
  assertEquals(out.three_ds?.creq, 'abc123');
});

Deno.test('toMpDate preserva o instante em offset -03:00', () => {
  assertEquals(toMpDate(new Date('2026-06-24T12:30:00.000Z')), '2026-06-24T09:30:00.000-03:00');
});
