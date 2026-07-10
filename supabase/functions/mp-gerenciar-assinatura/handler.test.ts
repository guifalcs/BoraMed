// Testes de REGRESSÃO do contrato legado (cancelar/pausar/reativar) — o
// comportamento abaixo é o que os assinantes atuais usam em produção — e da
// nova ação trocar_cartao (checkout embutido).
import { assertEquals } from '@std/assert';
import { handleGerenciarAssinatura } from './handler.ts';
import { FakeDb, fakeFetch, makeDeps } from '../_shared/test/fake.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z');

// deno-lint-ignore no-explicit-any
const find = (db: FakeDb, table: string, pred: (r: any) => boolean) =>
  db.rows(table).find(pred);

function baseDb(extra: Record<string, unknown[]> = {}): FakeDb {
  return new FakeDb({
    profiles: [{ id: 'user-1', email: 'a@b.com' }],
    assinatura: [
      {
        id: 'a1',
        user_id: 'user-1',
        mp_preapproval_id: 'PRE-1',
        status: 'authorized',
        criado_em: '2026-06-01T00:00:00.000Z',
      },
    ],
    ...extra,
  });
}

function request(body: unknown, auth = 'Bearer jwt'): Request {
  return new Request('https://proj.supabase.co/functions/v1/mp-gerenciar-assinatura', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

// ---------- Regressão do contrato legado ----------

Deno.test('gerenciar (legado): sem Authorization → 401', async () => {
  const res = await handleGerenciarAssinatura(
    request({ acao: 'cancelar' }, ''),
    makeDeps({ db: baseDb() }),
  );
  assertEquals(res.status, 401);
});

Deno.test('gerenciar (legado): método GET → 405', async () => {
  const res = await handleGerenciarAssinatura(
    new Request('https://x/mp-gerenciar-assinatura', { method: 'GET' }),
    makeDeps({ db: baseDb() }),
  );
  assertEquals(res.status, 405);
});

Deno.test('gerenciar (legado): ação inválida → 400', async () => {
  const res = await handleGerenciarAssinatura(
    request({ acao: 'explodir' }),
    makeDeps({ db: baseDb(), caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 400);
});

Deno.test('gerenciar (legado): sem assinatura ativa → 404', async () => {
  const db = baseDb({ assinatura: [] });
  const res = await handleGerenciarAssinatura(
    request({ acao: 'cancelar' }),
    makeDeps({ db, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 404);
});

Deno.test('gerenciar (legado): assinatura só cancelada → 404 (neq cancelled)', async () => {
  const db = baseDb({
    assinatura: [
      { id: 'a1', user_id: 'user-1', mp_preapproval_id: 'PRE-1', status: 'cancelled', criado_em: '2026-06-01T00:00:00.000Z' },
    ],
  });
  const res = await handleGerenciarAssinatura(
    request({ acao: 'reativar' }),
    makeDeps({ db, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 404);
});

Deno.test('gerenciar (legado) cancelar: PUT no MP, status local cancelled + cancelada_em', async () => {
  const db = baseDb();
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', body: { status: 'cancelled' } }]);
  const res = await handleGerenciarAssinatura(
    request({ acao: 'cancelar' }),
    makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, 'cancelled');
  const assin = find(db, 'assinatura', (r) => r.id === 'a1');
  assertEquals(assin?.status, 'cancelled');
  assertEquals(assin?.cancelada_em, NOW.toISOString());
});

Deno.test('gerenciar (legado) pausar/reativar: status local acompanha e cancelada_em zera', async () => {
  const db = baseDb();
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', body: {} }]);
  const deps = makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } });

  let res = await handleGerenciarAssinatura(request({ acao: 'pausar' }), deps);
  assertEquals((await res.json()).status, 'paused');
  assertEquals(find(db, 'assinatura', (r) => r.id === 'a1')?.status, 'paused');

  res = await handleGerenciarAssinatura(request({ acao: 'reativar' }), deps);
  assertEquals((await res.json()).status, 'authorized');
  const assin = find(db, 'assinatura', (r) => r.id === 'a1');
  assertEquals(assin?.status, 'authorized');
  assertEquals(assin?.cancelada_em, null);
});

Deno.test('gerenciar (legado): falha no MP → 502 e status local intacto', async () => {
  const db = baseDb();
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', status: 400, body: { message: 'nope' } }]);
  const res = await handleGerenciarAssinatura(
    request({ acao: 'cancelar' }),
    makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 502);
  assertEquals(find(db, 'assinatura', (r) => r.id === 'a1')?.status, 'authorized');
});

Deno.test('gerenciar (legado): usa a assinatura mais RECENTE não cancelada', async () => {
  const db = baseDb({
    assinatura: [
      { id: 'velha', user_id: 'user-1', mp_preapproval_id: 'PRE-OLD', status: 'paused', criado_em: '2026-01-01T00:00:00.000Z' },
      { id: 'nova', user_id: 'user-1', mp_preapproval_id: 'PRE-NEW', status: 'authorized', criado_em: '2026-06-01T00:00:00.000Z' },
    ],
  });
  const calls: string[] = [];
  const fetchFn = ((input: string | URL | Request) => {
    calls.push(String(input));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
  }) as typeof globalThis.fetch;
  await handleGerenciarAssinatura(
    request({ acao: 'pausar' }),
    makeDeps({ db, fetch: fetchFn, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(calls[0], 'https://api.mercadopago.com/preapproval/PRE-NEW');
});

// ---------- Nova ação: trocar_cartao ----------

Deno.test('gerenciar trocar_cartao: sem card_token_id → 400', async () => {
  const res = await handleGerenciarAssinatura(
    request({ acao: 'trocar_cartao' }),
    makeDeps({ db: baseDb(), caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 400);
});

Deno.test('gerenciar trocar_cartao: PUT com card_token_id, status local preservado', async () => {
  const db = baseDb();
  const bodies: string[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    void input;
    bodies.push(String(init?.body));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'authorized' }),
    } as Response);
  }) as typeof globalThis.fetch;
  const res = await handleGerenciarAssinatura(
    request({ acao: 'trocar_cartao', card_token_id: 'tok-novo' }),
    makeDeps({ db, fetch: fetchFn, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.card_updated, true);
  assertEquals(out.status, 'authorized');
  assertEquals(JSON.parse(bodies[0]).card_token_id, 'tok-novo');
  assertEquals(find(db, 'assinatura', (r) => r.id === 'a1')?.status, 'authorized');
});

Deno.test('gerenciar trocar_cartao: cartão novo recusado (4xx) → 200 card_updated:false, assinatura intacta', async () => {
  const db = baseDb();
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', status: 400, body: { message: 'invalid card' } }]);
  const res = await handleGerenciarAssinatura(
    request({ acao: 'trocar_cartao', card_token_id: 'tok-ruim' }),
    makeDeps({ db, fetch, now: NOW, caller: { id: 'user-1' } }),
  );
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.card_updated, false);
  assertEquals(find(db, 'assinatura', (r) => r.id === 'a1')?.status, 'authorized');
});
