import type { Deps } from '../_shared/deps.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { mpGet } from '../_shared/mp-api.ts';
import { syncAcessoUnicoPayment } from '../_shared/mp-payment-sync.ts';

// Reconciliação ATIVA de um pagamento do checkout embutido: usada pelo botão
// "Já paguei, verificar" (boleto), pelo polling pós-3DS e quando o webhook
// atrasa. Confere que a intenção pertence ao chamador, reconsulta o payment no
// MP e roda o MESMO sync do webhook (idempotente) — depois devolve apenas
// { status, status_detail } sanitizados.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleConsultarPagamento(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);
  const { data: callerData, error: callerError } = await deps
    .caller(authHeader)
    .auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  let body: { intencao_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  if (!body.intencao_id || typeof body.intencao_id !== 'string' || !UUID_RE.test(body.intencao_id)) {
    return reply({ error: 'invalid intencao_id' }, 400);
  }

  const admin = deps.admin();

  // Dono da intenção (evita consultar pagamento alheio)
  const { data: intencao } = await admin
    .from('pagamento_intencao')
    .select('id, user_id, mp_payment_id, status, status_detail')
    .eq('id', body.intencao_id)
    .maybeSingle();
  if (!intencao || intencao.user_id !== user.id) {
    return reply({ error: 'intenção não encontrada' }, 404);
  }

  // Sem payment no MP ainda (falha antes do POST): devolve o estado local.
  if (!intencao.mp_payment_id) {
    return reply({ status: intencao.status, status_detail: intencao.status_detail ?? null });
  }

  const mpToken = deps.env('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);

  const mp = { fetch: deps.fetch, token: mpToken };
  const pay = await mpGet(mp, `/v1/payments/${intencao.mp_payment_id}`);
  if (!pay) return reply({ error: 'falha ao consultar pagamento' }, 502);

  const result = await syncAcessoUnicoPayment(admin, pay, deps.now(), mp);
  return reply({ status: result.status, status_detail: result.statusDetail });
}
