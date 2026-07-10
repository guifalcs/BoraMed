// Cliente HTTP mínimo da API do Mercado Pago, compartilhado pelas edge
// functions. Sem estado: o token e o fetch são injetados (testável com fakes).
// NUNCA logar o body cru do MP (pode conter dados do pagador).

const MP_API = 'https://api.mercadopago.com';

export interface MpClientOpts {
  fetch: typeof fetch;
  token: string;
}

/** GET autenticado. Devolve o JSON ou null em erro (status logado sem body). */
export async function mpGet(
  opts: MpClientOpts,
  path: string,
): Promise<Record<string, unknown> | null> {
  const res = await opts.fetch(`${MP_API}${path}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) {
    console.error('MP GET error:', path, res.status);
    return null;
  }
  return await res.json().catch(() => null);
}

export interface MpPostResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

/**
 * POST autenticado com X-Idempotency-Key opcional. Devolve status + body mesmo
 * em erro: recusas 4xx do MP são resultado de negócio (ex.: cartão recusado),
 * não exceção de infraestrutura — o handler decide o que fazer.
 */
export async function mpPost(
  opts: MpClientOpts,
  path: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<MpPostResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const res = await opts.fetch(`${MP_API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/** PUT autenticado (ex.: trocar cartão do preapproval). Mesmo contrato do mpPost. */
export async function mpPut(
  opts: MpClientOpts,
  path: string,
  payload: Record<string, unknown>,
): Promise<MpPostResult> {
  const res = await opts.fetch(`${MP_API}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}
