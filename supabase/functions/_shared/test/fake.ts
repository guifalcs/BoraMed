// Test doubles para as edge functions de pagamento: um cliente Supabase
// em memória (suporta as cadeias usadas pelos handlers) e helpers para montar
// `Deps` e assinar requisições do webhook. Nada de rede nem banco real.

import type { Deps } from '../deps.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type Result = { data: unknown; error: unknown };

interface Filter {
  type: 'eq' | 'in' | 'gte';
  col: string;
  val: unknown;
}

/** Banco em memória: `tables` é um mapa tabela → linhas. */
export class FakeDb {
  tables: Record<string, Row[]> = {};
  private seq = 0;

  constructor(initial: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(initial)) {
      this.tables[t] = rows.map((r) => ({ ...r }));
    }
  }

  newId(table: string): string {
    return `${table}-fake-${++this.seq}`;
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  /** Retorna um objeto com a forma mínima de SupabaseClient usada pelos handlers. */
  client(): { from(table: string): FakeBuilder } {
    return { from: (table: string) => new FakeBuilder(this, table) };
  }
}

class FakeBuilder {
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private cols = '*';
  private filters: Filter[] = [];
  private payload: Row | Row[] | null = null;
  private conflict?: string;
  private wantSelect = false;

  constructor(private db: FakeDb, private table: string) {}

  select(cols = '*'): this {
    this.cols = cols;
    this.wantSelect = true;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }
  in(col: string, val: unknown[]): this {
    this.filters.push({ type: 'in', col, val });
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push({ type: 'gte', col, val });
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = payload;
    this.conflict = opts?.onConflict;
    return this;
  }

  private matches(r: Row): boolean {
    return this.filters.every((f) => {
      if (f.type === 'eq') return r[f.col] === f.val;
      if (f.type === 'gte') return String(r[f.col]) >= String(f.val);
      return (f.val as unknown[]).includes(r[f.col]);
    });
  }

  private run(): { rows: Row[]; error: unknown } {
    const store = this.db.rows(this.table);
    if (this.op === 'select') return { rows: store.filter((r) => this.matches(r)), error: null };

    if (this.op === 'insert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: this.db.newId(this.table),
        ...r,
      }));
      store.push(...items);
      return { rows: items, error: null };
    }

    if (this.op === 'update') {
      const target = store.filter((r) => this.matches(r));
      for (const r of target) Object.assign(r, this.payload);
      return { rows: target, error: null };
    }

    // upsert
    const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
    const out: Row[] = [];
    for (const item of items) {
      let existing: Row | undefined;
      if (this.conflict && item[this.conflict] != null) {
        existing = store.find((r) => r[this.conflict!] === item[this.conflict!]);
      }
      if (existing) {
        Object.assign(existing, item);
        out.push(existing);
      } else {
        const nr: Row = { id: this.db.newId(this.table), ...item };
        store.push(nr);
        out.push(nr);
      }
    }
    return { rows: out, error: null };
  }

  maybeSingle(): Promise<Result> {
    const { rows, error } = this.run();
    return Promise.resolve({ data: rows[0] ?? null, error });
  }
  single(): Promise<Result> {
    const { rows, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    if (rows.length === 0) {
      return Promise.resolve({ data: null, error: { message: 'no rows', code: 'PGRST116' } });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }
  // Torna o builder "awaitable" para chamadas sem terminal (update/upsert direto).
  then(resolve: (r: Result) => void): void {
    const { rows, error } = this.run();
    resolve({ data: this.wantSelect ? rows : null, error });
  }
}

/** Cliente "caller" fake: só expõe auth.getUser(). */
export function fakeCaller(
  user: { id: string; email?: string } | null,
  error: unknown = null,
) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error }),
    },
  };
}

export interface FakeDepsOptions {
  db?: FakeDb;
  caller?: { id: string; email?: string } | null;
  callerError?: unknown;
  env?: Record<string, string>;
  fetch?: typeof fetch;
  now?: Date;
}

const DEFAULT_ENV: Record<string, string> = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  MP_ACCESS_TOKEN: 'TEST-token',
  MP_WEBHOOK_SECRET: 'whsec_test',
  APP_URL: 'https://boramed.com',
};

/** Monta um `Deps` determinístico para os testes de handler. */
export function makeDeps(opts: FakeDepsOptions = {}): Deps {
  const db = opts.db ?? new FakeDb();
  const env = { ...DEFAULT_ENV, ...(opts.env ?? {}) };
  const fixedNow = opts.now ?? new Date('2026-06-24T12:00:00.000Z');
  return {
    env: (k) => env[k],
    // deno-lint-ignore no-explicit-any
    admin: () => db.client() as any,
    // deno-lint-ignore no-explicit-any
    caller: () => fakeCaller(opts.caller ?? null, opts.callerError) as any,
    fetch: opts.fetch ?? (() => Promise.reject(new Error('fetch não mockado'))),
    now: () => new Date(fixedNow.getTime()),
  };
}

/**
 * Cria um fetch fake roteado por substring de URL.
 * `routes` mapeia um trecho da URL → resposta JSON (ou um status de erro).
 */
export function fakeFetch(
  routes: Array<{ match: string; status?: number; body?: unknown }>,
): typeof fetch {
  // deno-lint-ignore no-explicit-any
  return ((input: any) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.reject(new Error(`rota fetch não mockada: ${url}`));
    const status = route.status ?? 200;
    const ok = status >= 200 && status < 300;
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(route.body ?? {}),
      text: () => Promise.resolve(JSON.stringify(route.body ?? {})),
    } as Response);
  }) as typeof fetch;
}

/** Calcula o header `x-signature` válido para um webhook do Mercado Pago. */
export async function signWebhook(
  secret: string,
  dataId: string,
  ts: string,
  requestId: string,
): Promise<string> {
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const v1 = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `ts=${ts},v1=${v1}`;
}

/** Monta uma Request POST de webhook já assinada. */
export async function signedWebhookRequest(opts: {
  secret: string;
  type: string;
  dataId: string;
  requestId?: string;
  ts?: string;
}): Promise<Request> {
  const requestId = opts.requestId ?? 'req-123';
  const ts = opts.ts ?? '1700000000';
  const signature = await signWebhook(opts.secret, opts.dataId, ts, requestId);
  return new Request('https://proj.supabase.co/functions/v1/mp-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
      'x-request-id': requestId,
    },
    body: JSON.stringify({ type: opts.type, data: { id: opts.dataId } }),
  });
}
