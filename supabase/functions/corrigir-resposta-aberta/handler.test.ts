import { assertEquals, assertStringIncludes } from '@std/assert';
import { FakeDb, makeDeps } from '../_shared/test/fake.ts';
import type { IaConfig } from '../_shared/ia-config.ts';
import { handleCorrigirRespostaAberta } from './handler.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = { id: 'user-1', email: 'aluno@boramed.com' };

function seedDb(overrides: {
  tentativaUserId?: string;
  enviadaEm?: string | null;
  correcaoStatus?: string;
  formato?: string;
} = {}): FakeDb {
  return new FakeDb({
    tentativa: [{ id: 'tent-1', user_id: overrides.tentativaUserId ?? USER.id }],
    tentativa_resposta: [
      {
        id: 'tr-1',
        tentativa_id: 'tent-1',
        questao_id: 'q-1',
        resposta_texto: 'Febre, icterícia e dor em hipocôndrio direito.',
        enviada_em: 'enviadaEm' in overrides ? overrides.enviadaEm : '2026-06-24T11:00:00Z',
        pontos: null,
      },
    ],
    questao: [
      {
        id: 'q-1',
        enunciado: 'Descreva a tríade de Charcot.',
        enunciado_apoio: null,
        formato: overrides.formato ?? 'resposta_aberta_curta',
        resposta_modelo: 'Febre, icterícia e dor em hipocôndrio direito.',
        pontos_chave: ['Cita febre', 'Cita icterícia', 'Cita dor em hipocôndrio direito'],
        criterios_correcao: 'Resposta curta e objetiva.',
      },
    ],
    resposta_correcao: [
      {
        id: 'rc-1',
        tentativa_resposta_id: 'tr-1',
        status: overrides.correcaoStatus ?? 'pendente',
        num_tentativas: 0,
        atualizado_em: '2026-06-24T11:00:00Z',
      },
    ],
  });
}

function request(body: unknown = { tentativa_resposta_id: 'tr-1' }): Request {
  return new Request('https://proj.supabase.co/functions/v1/corrigir-resposta-aberta', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  });
}

/** Conexão openai-compat no env (dev/secrets); a config do DB não guarda isso. */
const OPENAI_ENV = {
  AI_GRADING_PROVIDER: 'openai-compat',
  AI_GRADING_BASE_URL: 'https://openrouter.fake/api/v1',
  AI_GRADING_MODEL: 'test-model',
  AI_GRADING_API_KEY: 'sk-test',
};

/** Config do agente 'aurora' ativo (só comportamento; conexão vem do env). */
const ACTIVE_CONFIG: IaConfig = {
  slug: 'aurora',
  nome: 'Aurora',
  ativo: true,
  temperatura: 0,
  limite_diario: 200,
  max_resposta_chars: 3000,
  persona: null,
  tom: null,
  tamanho_feedback: null,
  regras_correcao: null,
  regras_extras: null,
};

/** fetch fake stateful: devolve as respostas na ordem, uma por chamada. */
function sequencialFetch(
  respostas: Array<{ status?: number; content?: string }>,
): { fetch: typeof fetch; chamadas: () => number } {
  let i = 0;
  const impl = ((_input: unknown) => {
    const r = respostas[Math.min(i++, respostas.length - 1)];
    const status = r.status ?? 200;
    const body = r.content !== undefined
      ? {
          choices: [{ message: { content: r.content } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.0012 },
        }
      : { error: 'upstream' };
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
  }) as typeof fetch;
  return { fetch: impl, chamadas: () => i };
}

const CORRECAO_OK = JSON.stringify({
  pontos: 85,
  feedback: 'Boa resposta, cobriu a tríade.',
  pontos_atendidos: ['Cita febre'],
  pontos_faltantes: [],
  erros: [],
});

// ---------------------------------------------------------------------------
// Auth / validação
// ---------------------------------------------------------------------------

Deno.test('rejeita chamada sem token', async () => {
  const req = new Request('https://x/y', { method: 'POST', body: '{}' });
  const res = await handleCorrigirRespostaAberta(req, makeDeps({ db: seedDb() }));
  assertEquals(res.status, 401);
});

Deno.test('rejeita body sem tentativa_resposta_id', async () => {
  const deps = makeDeps({ db: seedDb(), caller: USER });
  const res = await handleCorrigirRespostaAberta(request({}), deps);
  assertEquals(res.status, 400);
});

Deno.test('rejeita resposta de outro usuário (404, sem vazar existência)', async () => {
  const db = seedDb({ tentativaUserId: 'outro-user' });
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG });
  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 404);
});

Deno.test('rejeita resposta ainda não enviada (rascunho)', async () => {
  const db = seedDb({ enviadaEm: null });
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG });
  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 409);
});

Deno.test('rejeita questão que não é discursiva', async () => {
  const db = seedDb({ formato: 'multipla_escolha' });
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG });
  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 400);
});

// ---------------------------------------------------------------------------
// Fluxos de correção
// ---------------------------------------------------------------------------

Deno.test('sucesso: corrige, persiste resultado e pontos da resposta', async () => {
  const db = seedDb();
  const { fetch } = sequencialFetch([{ content: CORRECAO_OK }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 200);
  const { correcao } = await res.json();
  assertEquals(correcao.status, 'corrigida');
  assertEquals(correcao.pontos, 85);
  assertEquals(correcao.provider, 'openai-compat');
  assertEquals(correcao.modelo, 'test-model');
  assertEquals(correcao.tokens_prompt, 100);
  assertEquals(correcao.custo_usd, 0.0012);

  const tr = db.rows('tentativa_resposta')[0];
  assertEquals(tr.pontos, 85);
  assertEquals(db.rows('resposta_correcao')[0].num_tentativas, 1);
});

Deno.test('retry: JSON inválido na 1ª chamada, sucesso na 2ª', async () => {
  const db = seedDb();
  const seq = sequencialFetch([{ content: 'não é json {' }, { content: CORRECAO_OK }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch: seq.fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 200);
  assertEquals(seq.chamadas(), 2);
  const { correcao } = await res.json();
  assertEquals(correcao.status, 'corrigida');
});

Deno.test('5xx persistente esgota retries e marca erro', async () => {
  const db = seedDb();
  const seq = sequencialFetch([{ status: 500 }, { status: 502 }, { status: 503 }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch: seq.fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 502);
  assertEquals(seq.chamadas(), 3); // 1 + 2 retries
  const rc = db.rows('resposta_correcao')[0];
  assertEquals(rc.status, 'erro');
  assertStringIncludes(String(rc.erro_detalhe), '50');
});

Deno.test('4xx (não retryable) falha direto, sem retry', async () => {
  const db = seedDb();
  const seq = sequencialFetch([{ status: 400 }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch: seq.fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 502);
  assertEquals(seq.chamadas(), 1);
  assertEquals(db.rows('resposta_correcao')[0].status, 'erro');
});

Deno.test('claim duplo: status corrigindo devolve 202 sem chamar a IA', async () => {
  const db = seedDb({ correcaoStatus: 'corrigindo' });
  const seq = sequencialFetch([{ content: CORRECAO_OK }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch: seq.fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 202);
  assertEquals(seq.chamadas(), 0);
  const { correcao } = await res.json();
  assertEquals(correcao.status, 'corrigindo');
});

Deno.test('status erro pode ser re-claimado e corrigido', async () => {
  const db = seedDb({ correcaoStatus: 'erro' });
  const seq = sequencialFetch([{ content: CORRECAO_OK }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch: seq.fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 200);
  assertEquals(db.rows('resposta_correcao')[0].status, 'corrigida');
});

Deno.test('já corrigida: devolve o resultado existente sem nova chamada', async () => {
  const db = seedDb({ correcaoStatus: 'corrigida' });
  const seq = sequencialFetch([{ content: CORRECAO_OK }]);
  const deps = makeDeps({ db, caller: USER, env: OPENAI_ENV, iaConfig: ACTIVE_CONFIG, fetch: seq.fetch });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 200);
  assertEquals(seq.chamadas(), 0);
});

Deno.test('IA não configurada (sem agente) marca sem_ia (app funciona sem IA)', async () => {
  const db = seedDb();
  const deps = makeDeps({ db, caller: USER }); // sem iaConfig e sem chave
  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 200);
  const { correcao } = await res.json();
  assertEquals(correcao.status, 'sem_ia');
  assertEquals(db.rows('resposta_correcao')[0].status, 'sem_ia');
});

Deno.test('cap diário: usuário no limite recebe 429', async () => {
  const db = seedDb();
  // 2 correções do próprio usuário já corrigidas hoje (now fixo = 2026-06-24T12:00)
  db.rows('tentativa_resposta').push(
    { id: 'tr-2', tentativa_id: 'tent-1', questao_id: 'q-1' },
    { id: 'tr-3', tentativa_id: 'tent-1', questao_id: 'q-1' },
  );
  db.rows('resposta_correcao').push(
    { id: 'rc-2', tentativa_resposta_id: 'tr-2', status: 'corrigida', atualizado_em: '2026-06-24T10:00:00Z' },
    { id: 'rc-3', tentativa_resposta_id: 'tr-3', status: 'corrigida', atualizado_em: '2026-06-24T11:30:00Z' },
  );
  const seq = sequencialFetch([{ content: CORRECAO_OK }]);
  const deps = makeDeps({
    db,
    caller: USER,
    env: OPENAI_ENV,
    iaConfig: { ...ACTIVE_CONFIG, limite_diario: 2 },
    fetch: seq.fetch,
  });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 429);
  assertEquals(seq.chamadas(), 0);
  // não claimou: segue pendente
  assertEquals(db.rows('resposta_correcao')[0].status, 'pendente');
});

Deno.test('provider fake: corrige deterministicamente por pontos-chave', async () => {
  const db = seedDb();
  const deps = makeDeps({
    db,
    caller: USER,
    env: { AI_GRADING_PROVIDER: 'fake' },
    iaConfig: ACTIVE_CONFIG,
  });

  const res = await handleCorrigirRespostaAberta(request(), deps);
  assertEquals(res.status, 200);
  const { correcao } = await res.json();
  assertEquals(correcao.status, 'corrigida');
  assertEquals(correcao.provider, 'fake');
  // resposta cobre febre/icterícia/hipocôndrio → 3/3 = 100
  assertEquals(correcao.pontos, 100);
});
