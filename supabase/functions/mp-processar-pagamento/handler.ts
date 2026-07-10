import type { Deps } from '../_shared/deps.ts';
import { hasActiveAccess } from '../_shared/access.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { mpGet, mpPost } from '../_shared/mp-api.ts';
import { syncAcessoUnicoPayment } from '../_shared/mp-payment-sync.ts';

// Processa o pagamento do plano SEMESTRAL (acesso único) vindo do Payment
// Brick embutido: cartão em até 6x, Pix ou boleto. O frontend manda apenas o
// form_data do Brick (token do cartão etc.) + attempt_id; o PREÇO vem sempre
// do banco — nunca do cliente. A concessão de acesso definitiva é do webhook,
// mas a resposta síncrona já sincroniza o banco (syncAcessoUnicoPayment
// idempotente) para a UI rotear imediatamente.
//
// Segurança: idempotência via X-Idempotency-Key = attempt_id (UNIQUE em
// pagamento_intencao, 409 se de outro usuário), 409 com acesso ativo,
// rate limit 5 tentativas/15min (mitiga card testing), whitelist estrita do
// form_data (nada do body do cliente é repassado cru ao MP), resposta
// sanitizada (nunca o body cru do MP), nenhum log de token/dados de cartão.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PIX_EXPIRATION_MS = 30 * 60 * 1000;
const BOLETO_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000;

interface FormDataIn {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string | number;
  installments?: number;
  payer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    identification?: { type?: string; number?: string };
    address?: {
      zip_code?: string;
      street_name?: string;
      street_number?: string | number;
      neighborhood?: string;
      city?: string;
      federal_unit?: string;
    };
  };
}

/** Whitelist do endereço do pagador (obrigatório no boleto; o Brick coleta). */
function sanitizeAddress(
  address: NonNullable<FormDataIn['payer']>['address'],
): Record<string, string> | undefined {
  if (!address || typeof address !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const key of ['zip_code', 'street_name', 'street_number', 'neighborhood', 'city', 'federal_unit'] as const) {
    const val = address[key];
    if (val != null && val !== '') out[key] = String(val);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Data no formato aceito pelo MP (offset explícito, mesmo instante em -03:00). */
export function toMpDate(d: Date): string {
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace('Z', '-03:00');
}

/** Resposta sanitizada para o frontend a partir do payment do MP. */
// deno-lint-ignore no-explicit-any
export function sanitizePaymentResponse(intencaoId: string, pay: Record<string, any>) {
  const out: Record<string, unknown> = {
    intencao_id: intencaoId,
    payment_id: pay['id'] != null ? String(pay['id']) : null,
    status: String(pay['status'] ?? 'pending'),
    status_detail: (pay['status_detail'] as string | undefined) ?? null,
  };
  const expiraEm = (pay['date_of_expiration'] as string | undefined) ?? null;
  const tx = pay['point_of_interaction']?.['transaction_data'];
  if (tx?.qr_code) {
    out.pix = {
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64 ?? null,
      ticket_url: tx.ticket_url ?? null,
      expira_em: expiraEm,
    };
  }
  const boletoUrl = pay['transaction_details']?.['external_resource_url'];
  if (boletoUrl && !tx?.qr_code) {
    out.boleto = { url: boletoUrl, expira_em: expiraEm };
  }
  const tds = pay['three_ds_info'];
  if (tds?.external_resource_url) {
    out.three_ds = { external_resource_url: tds.external_resource_url, creq: tds.creq ?? null };
  }
  return out;
}

export async function handleProcessarPagamento(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  // 1. Identidade do chamador (JWT)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);
  const { data: callerData, error: callerError } = await deps
    .caller(authHeader)
    .auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  // 2. Body + attempt_id UUID
  let body: { attempt_id?: string; plano_slug?: string; form_data?: FormDataIn };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const attemptId = body.attempt_id;
  if (!attemptId || typeof attemptId !== 'string' || !UUID_RE.test(attemptId)) {
    return reply({ error: 'invalid attempt_id' }, 400);
  }
  if (!body.plano_slug || typeof body.plano_slug !== 'string') {
    return reply({ error: 'invalid plano_slug' }, 400);
  }
  const fd = body.form_data;
  if (!fd || typeof fd !== 'object' || typeof fd.payment_method_id !== 'string') {
    return reply({ error: 'invalid form_data' }, 400);
  }

  const admin = deps.admin();

  // 3. Plano ativo e de pagamento único
  const { data: plano } = await admin
    .from('plano')
    .select('id, nome, slug, ativo, recorrente, preco_centavos, moeda, frequency')
    .eq('slug', body.plano_slug)
    .maybeSingle();
  if (!plano) return reply({ error: 'plano não encontrado' }, 404);
  if (!plano.ativo) return reply({ error: 'plano inativo' }, 400);
  if (plano.recorrente) return reply({ error: 'plano não é de pagamento único' }, 400);

  // 4. Bloqueia cobrança dupla enquanto houver acesso ativo.
  //    NÃO barra assinatura `paused` aqui: este é o pagamento ÚNICO (semestral,
  //    /v1/payments), que não cria preapproval — não há risco de 2ª recorrência
  //    viva, e comprar o semestral é justamente uma forma de o pausado voltar a
  //    ter acesso. O anti-dupla de `paused` vale só p/ o fluxo recorrente
  //    (mp-processar-assinatura).
  const { data: assinaturas } = await admin
    .from('assinatura')
    .select('status, proxima_cobranca')
    .eq('user_id', user.id)
    .in('status', ['authorized', 'cancelled']);
  if (hasActiveAccess(assinaturas ?? [], deps.now().getTime())) {
    return reply({ error: 'Você já tem um acesso ativo no momento.' }, 409);
  }

  // 5. Idempotência / anti-replay do attempt_id
  const { data: existente } = await admin
    .from('pagamento_intencao')
    .select('id, user_id, mp_payment_id')
    .eq('idempotency_key', attemptId)
    .maybeSingle();
  if (existente && existente.user_id !== user.id) {
    return reply({ error: 'attempt_id em uso' }, 409);
  }

  const mpToken = deps.env('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);
  const mp = { fetch: deps.fetch, token: mpToken };

  // Replay do mesmo usuário com payment já criado: reconsulta e devolve o
  // estado atual (mesma resposta sanitizada) — não cria pagamento novo.
  if (existente?.mp_payment_id) {
    const pay = await mpGet(mp, `/v1/payments/${existente.mp_payment_id}`);
    if (!pay) return reply({ error: 'falha ao consultar pagamento' }, 502);
    await syncAcessoUnicoPayment(admin, pay, deps.now(), mp);
    return reply(sanitizePaymentResponse(existente.id, pay));
  }

  // 6. Rate limit: máx. 5 intenções por 15min por usuário (mitiga card testing)
  if (!existente) {
    const desde = new Date(deps.now().getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { data: recentes } = await admin
      .from('pagamento_intencao')
      .select('id')
      .eq('user_id', user.id)
      .gte('criado_em', desde);
    if ((recentes ?? []).length >= RATE_LIMIT_MAX) {
      return reply(
        { error: 'Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente.' },
        429,
      );
    }
  }

  // 7. Método e parcelas (whitelist estrita — nada além disto vai ao MP)
  const isCard = typeof fd.token === 'string' && fd.token.length > 0;
  const metodo = fd.payment_method_id;
  const isPix = metodo === 'pix';
  let installments = 1;
  if (isCard) {
    installments = Number(fd.installments ?? 1);
    if (!Number.isInteger(installments) || installments < 1 || installments > 6) {
      return reply({ error: 'installments deve ser entre 1 e 6' }, 400);
    }
  }

  // 8. Cria (ou reusa) a intenção com snapshot do preço DO BANCO
  let intencaoId = existente?.id ?? null;
  if (!intencaoId) {
    const { data: criada, error: insertError } = await admin
      .from('pagamento_intencao')
      .insert({
        user_id: user.id,
        plano_id: plano.id,
        tipo: 'acesso_unico',
        idempotency_key: attemptId,
        valor_centavos: plano.preco_centavos,
        metodo,
        parcelas: isCard ? installments : null,
        status: 'processando',
      })
      .select('id')
      .single();
    if (insertError || !criada) {
      // Corrida: outra requisição inseriu a mesma key. Reprocessa pela existente.
      const { data: again } = await admin
        .from('pagamento_intencao')
        .select('id, user_id')
        .eq('idempotency_key', attemptId)
        .maybeSingle();
      if (!again || again.user_id !== user.id) {
        return reply({ error: 'attempt_id em uso' }, 409);
      }
      intencaoId = again.id;
    } else {
      intencaoId = criada.id;
    }
  }

  // 9. Monta o payload do MP (preço do banco; payer whitelisted)
  const supabaseUrl = deps.env('SUPABASE_URL')!;
  const payerEmail = fd.payer?.email || user.email;
  const identification = fd.payer?.identification?.number
    ? {
        type: String(fd.payer.identification.type ?? 'CPF'),
        number: String(fd.payer.identification.number),
      }
    : undefined;
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    undefined;
  const address = sanitizeAddress(fd.payer?.address);

  const payload: Record<string, unknown> = {
    transaction_amount: plano.preco_centavos / 100,
    description: `BoraMed ${plano.nome}`,
    payment_method_id: metodo,
    installments,
    payer: {
      email: payerEmail,
      ...(fd.payer?.first_name ? { first_name: fd.payer.first_name } : {}),
      ...(fd.payer?.last_name ? { last_name: fd.payer.last_name } : {}),
      ...(identification ? { identification } : {}),
      ...(address ? { address } : {}),
    },
    statement_descriptor: 'BORAMED',
    // Único por transação, como o MP orienta (correlaciona payment ↔ intenção
    // na conciliação). O usuário é resolvido pelo metadata.user_id no sync.
    external_reference: intencaoId,
    // MP rejeita notification_url não-https (400) — no stack local (http://127.0.0.1)
    // o campo é omitido e a confirmação fica por conta do polling/reconciliação.
    ...(supabaseUrl.startsWith('https://')
      ? { notification_url: `${supabaseUrl}/functions/v1/mp-webhook` }
      : {}),
    metadata: {
      tipo: 'acesso_unico',
      plano_slug: plano.slug,
      user_id: user.id,
      acesso_meses: plano.frequency,
      intencao_id: intencaoId,
    },
    additional_info: {
      items: [
        {
          id: plano.slug,
          title: `BoraMed ${plano.nome}`,
          description: 'Acesso à plataforma de estudos BoraMed',
          category_id: 'learnings',
          quantity: 1,
          unit_price: plano.preco_centavos / 100,
        },
      ],
      ...(fd.payer?.first_name || fd.payer?.last_name
        ? {
            payer: {
              ...(fd.payer?.first_name ? { first_name: fd.payer.first_name } : {}),
              ...(fd.payer?.last_name ? { last_name: fd.payer.last_name } : {}),
            },
          }
        : {}),
      ...(ipAddress ? { ip_address: ipAddress } : {}),
    },
    binary_mode: false,
    capture: true,
  };
  if (isCard) {
    payload.token = fd.token;
    payload.three_d_secure_mode = 'optional';
    if (fd.issuer_id != null) payload.issuer_id = Number(fd.issuer_id);
  } else {
    // Pix expira em 30min; boleto em 3 dias.
    const ttl = isPix ? PIX_EXPIRATION_MS : BOLETO_EXPIRATION_MS;
    payload.date_of_expiration = toMpDate(new Date(deps.now().getTime() + ttl));
  }

  // 10. POST /v1/payments com X-Idempotency-Key = attempt_id
  const res = await mpPost(mp, '/v1/payments', payload, attemptId);

  if (!res.ok) {
    // 4xx = recusa/erro de dados (resultado de negócio); 5xx = infra do MP.
    const detail =
      (res.body['message'] as string | undefined) ??
      ((res.body['cause'] as Array<{ description?: string }> | undefined)?.[0]?.description ??
        'erro no processamento');
    console.error('MP /v1/payments error:', res.status, detail);
    if (res.status >= 500) {
      await admin
        .from('pagamento_intencao')
        .update({ status: 'criada', status_detail: 'mp_indisponivel' })
        .eq('id', intencaoId);
      return reply({ error: 'Pagamento temporariamente indisponível. Tente novamente.' }, 502);
    }
    await admin
      .from('pagamento_intencao')
      .update({ status: 'recusada', status_detail: 'mp_request_error' })
      .eq('id', intencaoId);
    return reply({
      intencao_id: intencaoId,
      payment_id: null,
      status: 'rejected',
      status_detail: 'mp_request_error',
    });
  }

  // 11. Sincroniza o banco (idempotente; o webhook fará o mesmo depois) e
  // marca a expiração da intenção para Pix/boleto.
  const pay = res.body;
  await syncAcessoUnicoPayment(admin, pay, deps.now(), mp);
  if (pay['date_of_expiration']) {
    await admin
      .from('pagamento_intencao')
      .update({ expira_em: new Date(String(pay['date_of_expiration'])).toISOString() })
      .eq('id', intencaoId);
  }

  return reply(sanitizePaymentResponse(intencaoId!, pay));
}
