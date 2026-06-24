import { assertEquals } from 'jsr:@std/assert@1';
import { handleVincularAssinatura } from './handler.ts';
import { FakeDb, fakeFetch, makeDeps } from '../_shared/test/fake.ts';

function req(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (withAuth) headers['Authorization'] = 'Bearer token';
  return new Request('https://proj.supabase.co/functions/v1/mp-vincular-assinatura', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const subBody = (overrides: Record<string, unknown> = {}) => ({
  status: 'authorized',
  payer_email: 'me@b.com',
  preapproval_plan_id: 'PP-1',
  next_payment_date: '2026-07-24T12:00:00.000Z',
  date_created: '2026-06-24T12:00:00.000Z',
  ...overrides,
});

Deno.test('vincular: sem Authorization → 401', async () => {
  const res = await handleVincularAssinatura(req({ preapproval_id: 'PRE-1' }, false), makeDeps({}));
  assertEquals(res.status, 401);
});

Deno.test('vincular: IDOR — payer_email diferente da conta → 403', async () => {
  const db = new FakeDb({ plano: [{ id: 'pl1', mp_preapproval_plan_id: 'PP-1' }], assinatura: [] });
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', body: subBody({ payer_email: 'outro@b.com' }) }]);
  const res = await handleVincularAssinatura(
    req({ preapproval_id: 'PRE-1' }),
    makeDeps({ db, caller: { id: 'u1', email: 'me@b.com' }, fetch }),
  );
  assertEquals(res.status, 403);
  assertEquals(db.rows('assinatura').length, 0, 'nada deve ser vinculado em caso de IDOR');
});

Deno.test('vincular: assinatura não encontrada no MP → 404', async () => {
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', status: 404, body: {} }]);
  const res = await handleVincularAssinatura(
    req({ preapproval_id: 'PRE-1' }),
    makeDeps({ caller: { id: 'u1', email: 'me@b.com' }, fetch }),
  );
  assertEquals(res.status, 404);
});

Deno.test('vincular: plano não corresponde a um plano nosso → 400', async () => {
  const db = new FakeDb({ plano: [], assinatura: [] });
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', body: subBody({ preapproval_plan_id: 'DESCONHECIDO' }) }]);
  const res = await handleVincularAssinatura(
    req({ preapproval_id: 'PRE-1' }),
    makeDeps({ db, caller: { id: 'u1', email: 'me@b.com' }, fetch }),
  );
  assertEquals(res.status, 400);
});

Deno.test('vincular: já vinculada a outra conta → 409', async () => {
  const db = new FakeDb({
    plano: [{ id: 'pl1', mp_preapproval_plan_id: 'PP-1' }],
    assinatura: [{ id: 'x', user_id: 'OUTRO-USER', mp_preapproval_id: 'PRE-1' }],
  });
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', body: subBody() }]);
  const res = await handleVincularAssinatura(
    req({ preapproval_id: 'PRE-1' }),
    makeDeps({ db, caller: { id: 'u1', email: 'me@b.com' }, fetch }),
  );
  assertEquals(res.status, 409);
});

Deno.test('vincular: e-mail confere e plano resolve → vincula e devolve status', async () => {
  const db = new FakeDb({ plano: [{ id: 'pl1', mp_preapproval_plan_id: 'PP-1' }], assinatura: [] });
  const fetch = fakeFetch([{ match: '/preapproval/PRE-1', body: subBody() }]);
  const res = await handleVincularAssinatura(
    req({ preapproval_id: 'PRE-1' }),
    makeDeps({ db, caller: { id: 'u1', email: 'me@b.com' }, fetch }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.status, 'authorized');

  const assin = db.rows('assinatura').find((r) => r.mp_preapproval_id === 'PRE-1');
  assertEquals(assin?.user_id, 'u1');
  assertEquals(assin?.plano_id, 'pl1');
  assertEquals(assin?.proxima_cobranca, '2026-07-24T12:00:00.000Z');
});
