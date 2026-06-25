import { assertEquals } from '@std/assert';
import { handleCriarAssinatura } from './handler.ts';
import { FakeDb, fakeFetch, makeDeps } from '../_shared/test/fake.ts';

const FUTURO = '2026-12-24T12:00:00.000Z';
const NOW = new Date('2026-06-24T12:00:00.000Z');

function req(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (withAuth) headers['Authorization'] = 'Bearer token';
  return new Request('https://proj.supabase.co/functions/v1/mp-criar-assinatura', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test('criar-assinatura: sem Authorization → 401', async () => {
  const res = await handleCriarAssinatura(req({ plano_slug: 'mensal' }, false), makeDeps({}));
  assertEquals(res.status, 401);
});

Deno.test('criar-assinatura: usuário inválido (caller error) → 401', async () => {
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'mensal' }),
    makeDeps({ callerError: { message: 'bad jwt' } }),
  );
  assertEquals(res.status, 401);
});

Deno.test('criar-assinatura: plano_slug ausente → 400', async () => {
  const res = await handleCriarAssinatura(req({}), makeDeps({ caller: { id: 'u1', email: 'a@b.com' } }));
  assertEquals(res.status, 400);
});

Deno.test('criar-assinatura: plano inexistente → 404', async () => {
  const db = new FakeDb({ plano: [], assinatura: [] });
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'inexistente' }),
    makeDeps({ db, caller: { id: 'u1', email: 'a@b.com' } }),
  );
  assertEquals(res.status, 404);
});

Deno.test('criar-assinatura: plano inativo → 400', async () => {
  const db = new FakeDb({
    plano: [{ id: 'p1', slug: 'mensal', ativo: false, recorrente: true, mp_init_point: 'https://mp' }],
    assinatura: [],
  });
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'mensal' }),
    makeDeps({ db, caller: { id: 'u1', email: 'a@b.com' } }),
  );
  assertEquals(res.status, 400);
});

Deno.test('criar-assinatura: bloqueia quando já há acesso ativo → 409 (anti cobrança dupla)', async () => {
  const db = new FakeDb({
    plano: [{ id: 'p1', slug: 'mensal', ativo: true, recorrente: true, mp_init_point: 'https://mp' }],
    assinatura: [{ user_id: 'u1', status: 'authorized', proxima_cobranca: FUTURO }],
  });
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'mensal' }),
    makeDeps({ db, caller: { id: 'u1', email: 'a@b.com' }, now: NOW }),
  );
  assertEquals(res.status, 409);
});

Deno.test('criar-assinatura recorrente: cria preapproval (external_reference persistido) e assinatura pending', async () => {
  const db = new FakeDb({
    plano: [
      {
        id: 'p1',
        slug: 'mensal',
        nome: 'Mensal',
        ativo: true,
        recorrente: true,
        preco_centavos: 4990,
        frequency: 1,
        frequency_type: 'months',
        moeda: 'BRL',
      },
    ],
    assinatura: [],
  });
  const fetch = fakeFetch([
    {
      match: '/preapproval',
      body: { id: 'PRE-NEW', init_point: 'https://mp/sub/PRE-NEW', external_reference: 'user-abc' },
    },
  ]);
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'mensal' }),
    makeDeps({ db, caller: { id: 'user-abc', email: 'a@b.com' }, fetch, now: NOW }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.init_point, 'https://mp/sub/PRE-NEW');
  // A assinatura nasce 'pending', já vinculada ao usuário e ao plano — não
  // depende do retorno do usuário nem do external_reference no webhook.
  const assin = db.rows('assinatura').find((r) => r.mp_preapproval_id === 'PRE-NEW');
  assertEquals(assin?.user_id, 'user-abc');
  assertEquals(assin?.plano_id, 'p1');
  assertEquals(assin?.status, 'pending');
});

Deno.test('criar-assinatura único (semestral): cria preferência e devolve init_point', async () => {
  const db = new FakeDb({
    plano: [
      {
        id: 'p2',
        slug: 'semestral',
        nome: 'Semestral',
        ativo: true,
        recorrente: false,
        preco_centavos: 19990,
        frequency: 6,
      },
    ],
    assinatura: [],
  });
  const fetch = fakeFetch([
    { match: '/checkout/preferences', body: { init_point: 'https://mp/pref-xyz' } },
  ]);
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'semestral' }),
    makeDeps({ db, caller: { id: 'u2', email: 'a@b.com' }, fetch, now: NOW }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.init_point, 'https://mp/pref-xyz');
});

Deno.test('criar-assinatura único: erro do MP → 502', async () => {
  const db = new FakeDb({
    plano: [{ id: 'p2', slug: 'semestral', nome: 'Semestral', ativo: true, recorrente: false, preco_centavos: 19990, frequency: 6 }],
    assinatura: [],
  });
  const fetch = fakeFetch([{ match: '/checkout/preferences', status: 400, body: { message: 'bad' } }]);
  const res = await handleCriarAssinatura(
    req({ plano_slug: 'semestral' }),
    makeDeps({ db, caller: { id: 'u2', email: 'a@b.com' }, fetch, now: NOW }),
  );
  assertEquals(res.status, 502);
});
