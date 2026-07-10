import { assertEquals, assertExists } from '@std/assert';
import { handleProcessarAssinatura } from './handler.ts';
import { FakeDb, makeDeps } from '../_shared/test/fake.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z');
const ATTEMPT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

function baseDb(extra: Record<string, unknown[]> = {}): FakeDb {
  return new FakeDb({
    profiles: [{ id: 'user-1', email: 'aluno@boramed.com' }],
    plano: [
      {
        id: 'pl-men',
        slug: 'mensal',
        nome: 'Mensal',
        ativo: true,
        recorrente: true,
        preco_centavos: 4990,
        moeda: 'BRL',
        frequency: 1,
        frequency_type: 'months',
      },
      {
        id: 'pl-sem',
        slug: 'semestral',
        nome: 'Semestral',
        ativo: true,
        recorrente: false,
        preco_centavos: 19990,
        moeda: 'BRL',
        frequency: 6,
        frequency_type: 'months',
      },
    ],
    assinatura: [],
    pagamento: [],
    pagamento_intencao: [],
    ...extra,
  });
}

function request(body: unknown, auth = 'Bearer jwt'): Request {
  return new Request('https://proj.supabase.co/functions/v1/mp-processar-assinatura', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

function goodBody(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: ATTEMPT,
    plano_slug: 'mensal',
    card_token_id: 'card-tok-1',
    payer: { identification: { type: 'CPF', number: '12345678909' } },
    ...overrides,
  };
}

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
    } as Response);
  }) as typeof fetch;
  return { fn, calls };
}

const authorizedPre = {
  id: 'PRE-1',
  status: 'authorized',
  date_created: '2026-06-24T12:00:00.000Z',
  next_payment_date: '2026-07-24T12:00:00.000Z',
};

Deno.test('processar-assinatura: sem Authorization → 401', async () => {
  const res = await handleProcessarAssinatura(request(goodBody(), ''), makeDeps({ db: baseDb() }));
  assertEquals(res.status, 401);
});

Deno.test('processar-assinatura: attempt_id inválido / sem card_token → 400', async () => {
  const deps = () => makeDeps({ db: baseDb(), caller: { id: 'user-1', email: 'aluno@boramed.com' } });
  assertEquals((await handleProcessarAssinatura(request(goodBody({ attempt_id: 'x' })), deps())).status, 400);
  assertEquals((await handleProcessarAssinatura(request(goodBody({ card_token_id: undefined })), deps())).status, 400);
});

Deno.test('processar-assinatura: plano não recorrente → 400', async () => {
  const res = await handleProcessarAssinatura(
    request(goodBody({ plano_slug: 'semestral' })),
    makeDeps({ db: baseDb(), caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 400);
});

Deno.test('processar-assinatura: acesso ativo → 409', async () => {
  const db = baseDb({
    assinatura: [
      { id: 'a1', user_id: 'user-1', status: 'authorized', proxima_cobranca: '2026-12-01T00:00:00.000Z' },
    ],
  });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 409);
});

Deno.test('processar-assinatura: assinatura pausada → 409 direciona p/ reativar, sem 2º preapproval', async () => {
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
  const { fn, calls } = captureFetch({ body: authorizedPre });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 409);
  assertEquals(calls.length, 0, 'não cria um 2º preapproval para quem está pausado');
  const out = await res.json();
  assertEquals(typeof out.error, 'string');
});

Deno.test('processar-assinatura authorized com next_payment_date = agora → acesso provisório (+3 dias)', async () => {
  const db = baseDb();
  const { fn } = captureFetch({
    body: {
      id: 'PRE-2',
      status: 'authorized',
      date_created: NOW.toISOString(),
      next_payment_date: NOW.toISOString(), // MP devolve = agora até a 1ª fatura processar
    },
  });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  const assin = find(db, 'assinatura', (r) => r.mp_preapproval_id === 'PRE-2');
  assertExists(assin);
  // NOW = 2026-06-24 → concede +3 dias provisórios (a 1ª cobrança real grava a
  // data verdadeira via webhook; se falhar, o acesso expira em 72h).
  assertEquals(assin?.proxima_cobranca, '2026-06-27T12:00:00.000Z');
});

Deno.test('processar-assinatura: attempt_id de outro usuário → 409', async () => {
  const db = baseDb({
    pagamento_intencao: [
      { id: 'int-x', user_id: 'user-2', idempotency_key: ATTEMPT, criado_em: NOW.toISOString() },
    ],
  });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 409);
});

Deno.test('processar-assinatura: rate limit 5/15min → 429', async () => {
  const recentes = Array.from({ length: 5 }, (_, i) => ({
    id: `int-${i}`,
    user_id: 'user-1',
    idempotency_key: `00000000-0000-0000-0000-00000000000${i}`,
    criado_em: new Date(NOW.getTime() - 60 * 1000).toISOString(),
  }));
  const db = baseDb({ pagamento_intencao: recentes });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 429);
});

Deno.test('processar-assinatura authorized: payload correto (preço do banco, status authorized, e-mail da conta), assinatura criada', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({ body: authorizedPre });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);

  assertEquals(calls[0].url, 'https://api.mercadopago.com/preapproval');
  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(sent.card_token_id, 'card-tok-1');
  assertEquals(sent.status, 'authorized');
  assertEquals(sent.payer_email, 'aluno@boramed.com', 'e-mail da conta, não do form');
  assertEquals(sent.external_reference, 'user-1');
  assertEquals(sent.auto_recurring.transaction_amount, 49.9, 'preço do banco');
  assertEquals(sent.auto_recurring.frequency, 1);
  assertEquals(sent.auto_recurring.frequency_type, 'months');
  assertExists(sent.back_url);
  const headers = calls[0].init?.headers as Record<string, string>;
  assertEquals(headers['X-Idempotency-Key'], ATTEMPT);

  const out = await res.json();
  assertEquals(out.status, 'authorized');

  const assin = find(db, 'assinatura', (r) => r.mp_preapproval_id === 'PRE-1');
  assertExists(assin);
  assertEquals(assin?.status, 'authorized');
  assertEquals(assin?.plano_id, 'pl-men');
  assertEquals(assin?.proxima_cobranca, '2026-07-24T12:00:00.000Z');

  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'aprovada');
  assertEquals(int?.mp_preapproval_id, 'PRE-1');
  assertEquals(int?.valor_centavos, 4990);

  assertEquals(db.rows('pagamento').length, 0, 'cobrança de verificação não vira pagamento');
});

Deno.test('processar-assinatura: APP_URL e SUPABASE_URL http (stack local) → back_url https de fallback', async () => {
  const db = baseDb();
  const { fn, calls } = captureFetch({ body: authorizedPre });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({
      db,
      fetch: fn,
      now: NOW,
      caller: { id: 'user-1', email: 'aluno@boramed.com' },
      env: { APP_URL: 'http://localhost:4200', SUPABASE_URL: 'http://127.0.0.1:54321' },
    }),
  );
  assertEquals(res.status, 200);
  const sent = JSON.parse(String(calls[0].init?.body));
  assertEquals(
    sent.back_url,
    'https://www.boramedoficial.com.br/assinatura/retorno',
    'MP rejeita back_url não-https; no local cai no domínio de produção',
  );
});

Deno.test('processar-assinatura authorized supera assinatura anterior (B5)', async () => {
  const db = baseDb({
    assinatura: [
      // Acesso já EXPIRADO (não bloqueia no 409), mas ainda 'authorized' — o
      // caso real do semestral vencido.
      { id: 'old', user_id: 'user-1', status: 'authorized', mp_payment_id: 'PAY-OLD', proxima_cobranca: '2026-01-01T00:00:00.000Z' },
    ],
  });
  const { fn } = captureFetch({ body: authorizedPre });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  assertEquals(find(db, 'assinatura', (r) => r.id === 'old')?.status, 'cancelled');
  assertEquals(find(db, 'assinatura', (r) => r.mp_preapproval_id === 'PRE-1')?.status, 'authorized');
});

Deno.test('processar-assinatura: cartão recusado (4xx do MP) → 200 rejected + intenção recusada, sem assinatura', async () => {
  const db = baseDb();
  const { fn } = captureFetch({ status: 400, body: { message: 'Cannot process card' } });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200, 'recusa é resultado de negócio, não erro');
  const out = await res.json();
  assertEquals(out.status, 'rejected');
  assertEquals(out.status_detail, 'card_rejected');
  assertEquals(db.rows('assinatura').length, 0);
  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'recusada');
});

Deno.test('processar-assinatura: 5xx do MP → 502 e intenção volta a criada', async () => {
  const db = baseDb();
  const { fn } = captureFetch({ status: 500, body: {} });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 502);
  const int = find(db, 'pagamento_intencao', (r) => r.idempotency_key === ATTEMPT);
  assertEquals(int?.status, 'criada');
});

Deno.test('processar-assinatura replay do mesmo usuário: devolve o resultado registrado sem novo POST', async () => {
  const db = baseDb({
    pagamento_intencao: [
      {
        id: 'int-1',
        user_id: 'user-1',
        idempotency_key: ATTEMPT,
        mp_preapproval_id: 'PRE-1',
        status: 'aprovada',
        criado_em: NOW.toISOString(),
      },
    ],
    assinatura: [
      // Assinatura pendente (não authorized) → não bloqueia por acesso ativo.
      { id: 'a1', user_id: 'user-1', mp_preapproval_id: 'PRE-1', status: 'pending' },
    ],
  });
  const { fn, calls } = captureFetch({ body: {} });
  const res = await handleProcessarAssinatura(
    request(goodBody()),
    makeDeps({ db, fetch: fn, now: NOW, caller: { id: 'user-1', email: 'aluno@boramed.com' } }),
  );
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0, 'não chama o MP de novo');
  const out = await res.json();
  assertEquals(out.status, 'pending');
});
