import type { Deps } from '../_shared/deps.ts';
import { hasActiveAccess } from '../_shared/access.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { mpPost } from '../_shared/mp-api.ts';

// Cria a assinatura MENSAL recorrente a partir do card token gerado pelo
// Payment Brick embutido: POST /preapproval com status 'authorized' — o MP
// valida o cartão na hora (cobrança de verificação de valor mínimo, estornada
// automaticamente; NÃO registramos como `pagamento`). Sem redirect: o resultado
// volta síncrono.
//
// Recusa de cartão (4xx do MP) é RESULTADO DE NEGÓCIO, não erro de infra:
// devolve HTTP 200 com { status: 'rejected', status_detail } para a UI mapear
// a mensagem. As cobranças recorrentes seguintes continuam chegando pelos
// webhooks subscription_preapproval / subscription_authorized_payment,
// inalterados (mesmo caminho dos assinantes legados).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Mapeia o status do preapproval para o status da pagamento_intencao. */
function intencaoStatusFromPreapproval(status: string): string {
  if (status === 'authorized') return 'aprovada';
  if (status === 'pending') return 'pendente';
  return 'recusada';
}

/**
 * Soma o período do plano a partir de `from`. Usado como acesso provisório
 * quando o MP ainda não definiu a 1ª data de cobrança real (next_payment_date
 * nasce = agora, a fatura processa assíncrono).
 */
function addPeriodo(from: Date, frequency: number, frequencyType: string): string {
  const d = new Date(from.getTime());
  if (frequencyType === 'months') d.setUTCMonth(d.getUTCMonth() + frequency);
  else d.setUTCDate(d.getUTCDate() + frequency);
  return d.toISOString();
}

export async function handleProcessarAssinatura(req: Request, deps: Deps): Promise<Response> {
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
  if (!user.email) return reply({ error: 'conta sem e-mail' }, 400);

  // 2. Body
  let body: {
    attempt_id?: string;
    plano_slug?: string;
    card_token_id?: string;
    payer?: { identification?: { type?: string; number?: string } };
  };
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
  if (!body.card_token_id || typeof body.card_token_id !== 'string') {
    return reply({ error: 'invalid card_token_id' }, 400);
  }

  const admin = deps.admin();

  // 3. Plano ativo e recorrente
  const { data: plano } = await admin
    .from('plano')
    .select('id, nome, slug, ativo, recorrente, preco_centavos, moeda, frequency, frequency_type')
    .eq('slug', body.plano_slug)
    .maybeSingle();
  if (!plano) return reply({ error: 'plano não encontrado' }, 404);
  if (!plano.ativo) return reply({ error: 'plano inativo' }, 400);
  if (!plano.recorrente) return reply({ error: 'plano não é recorrente' }, 400);

  // 4. Bloqueia cobrança dupla enquanto houver acesso ativo; assinatura pausada
  //    direciona para reativação (evita 2º preapproval vivo no MP).
  const { data: assinaturas } = await admin
    .from('assinatura')
    .select('status, proxima_cobranca')
    .eq('user_id', user.id)
    .in('status', ['authorized', 'cancelled', 'paused']);
  const linhasAcesso = assinaturas ?? [];
  if (hasActiveAccess(linhasAcesso.filter((a) => a.status !== 'paused'), deps.now().getTime())) {
    return reply({ error: 'Você já tem um acesso ativo no momento.' }, 409);
  }
  if (linhasAcesso.some((a) => a.status === 'paused')) {
    return reply(
      { error: 'Sua assinatura está pausada. Reative-a em "Minha assinatura" para voltar a estudar.' },
      409,
    );
  }

  // 5. Idempotência / anti-replay do attempt_id
  const { data: existente } = await admin
    .from('pagamento_intencao')
    .select('id, user_id, mp_preapproval_id, status, status_detail')
    .eq('idempotency_key', attemptId)
    .maybeSingle();
  if (existente && existente.user_id !== user.id) {
    return reply({ error: 'attempt_id em uso' }, 409);
  }
  // Replay do mesmo usuário com preapproval já criado: devolve o resultado
  // registrado (cada retentativa da UI usa attempt_id + token novos).
  if (existente?.mp_preapproval_id) {
    const { data: assinExistente } = await admin
      .from('assinatura')
      .select('status')
      .eq('mp_preapproval_id', existente.mp_preapproval_id)
      .maybeSingle();
    return reply({
      intencao_id: existente.id,
      status: assinExistente?.status ?? 'pending',
      status_detail: existente.status_detail ?? null,
    });
  }

  // 6. Rate limit: máx. 5 intenções por 15min por usuário
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

  const mpToken = deps.env('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);

  // 7. Intenção com snapshot do preço DO BANCO
  let intencaoId = existente?.id ?? null;
  if (!intencaoId) {
    const { data: criada, error: insertError } = await admin
      .from('pagamento_intencao')
      .insert({
        user_id: user.id,
        plano_id: plano.id,
        tipo: 'assinatura',
        idempotency_key: attemptId,
        valor_centavos: plano.preco_centavos,
        metodo: 'credit_card',
        parcelas: 1,
        status: 'processando',
      })
      .select('id')
      .single();
    if (insertError || !criada) {
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

  // 8. POST /preapproval com o cartão (preço do banco; e-mail da conta)
  const appUrl = (deps.env('APP_URL') ?? '').replace(/\/$/, '');
  const supabaseUrl = deps.env('SUPABASE_URL')!;
  // back_url é exigido pela API mas não há redirect neste fluxo (API direta).
  // O MP valida o formato e recusa URLs não-https — no stack local (APP_URL e
  // SUPABASE_URL em http) cai no domínio de produção só para passar na validação.
  const backUrl = appUrl.startsWith('https://')
    ? `${appUrl}/assinatura/retorno`
    : supabaseUrl.startsWith('https://')
      ? `${supabaseUrl}/functions/v1/mp-retorno`
      : 'https://www.boramedoficial.com.br/assinatura/retorno';

  const res = await mpPost(
    { fetch: deps.fetch, token: mpToken },
    '/preapproval',
    {
      reason: `BoraMed ${plano.nome}`,
      external_reference: user.id,
      payer_email: user.email,
      card_token_id: body.card_token_id,
      back_url: backUrl,
      status: 'authorized',
      auto_recurring: {
        frequency: plano.frequency,
        frequency_type: plano.frequency_type,
        transaction_amount: plano.preco_centavos / 100,
        currency_id: plano.moeda ?? 'BRL',
      },
    },
    attemptId,
  );

  if (!res.ok) {
    const detail =
      (res.body['message'] as string | undefined) ?? 'erro no processamento';
    console.error('MP /preapproval error:', res.status, detail);
    if (res.status >= 500) {
      await admin
        .from('pagamento_intencao')
        .update({ status: 'criada', status_detail: 'mp_indisponivel' })
        .eq('id', intencaoId);
      return reply({ error: 'Pagamento temporariamente indisponível. Tente novamente.' }, 502);
    }
    // 4xx: cartão recusado na cobrança de verificação (resultado de negócio).
    await admin
      .from('pagamento_intencao')
      .update({ status: 'recusada', status_detail: 'card_rejected' })
      .eq('id', intencaoId);
    return reply({
      intencao_id: intencaoId,
      status: 'rejected',
      status_detail: 'card_rejected',
    });
  }

  const pre = res.body;
  const preId = pre['id'] != null ? String(pre['id']) : null;
  const status = String(pre['status'] ?? 'pending');
  const nextPayment = (pre['next_payment_date'] as string | undefined) ?? null;

  if (!preId) {
    console.error('MP /preapproval sem id na resposta');
    return reply({ error: 'falha ao criar assinatura' }, 502);
  }

  // 9. Upsert da assinatura com o status retornado (webhook confirma depois).
  // B5: se autorizada, supera outras 'authorized' antes (máx. 1 ativa).
  if (status === 'authorized') {
    await admin
      .from('assinatura')
      .update({ status: 'cancelled', cancelada_em: deps.now().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'authorized');
  }
  // Acesso provisório: o preapproval nasce com next_payment_date = agora (a 1ª
  // fatura processa assíncrono no MP, em minutos/horas). Sem uma data futura,
  // tem_assinatura_ativa() ficaria false e o usuário travaria em "Liberando…".
  // Concede 1 DIA provisório (não 1 período): se a cobrança real falhar e o
  // MP cancelar, a carência do provisório expira em 24h em vez de 1 mês —
  // limita uso sem pagamento. O webhook subscription_authorized_payment grava
  // a data real (+1 período) quando a 1ª cobrança processa.
  let proximaCobranca = nextPayment;
  if (status === 'authorized') {
    const nextMs = nextPayment ? new Date(nextPayment).getTime() : 0;
    if (!nextMs || nextMs <= deps.now().getTime()) {
      proximaCobranca = addPeriodo(deps.now(), 1, 'days');
    }
  }

  await admin.from('assinatura').upsert(
    {
      user_id: user.id,
      plano_id: plano.id,
      mp_preapproval_id: preId,
      status,
      data_inicio: (pre['date_created'] as string | undefined) ?? deps.now().toISOString(),
      ...(proximaCobranca ? { proxima_cobranca: proximaCobranca } : {}),
      cancelada_em: null,
    },
    { onConflict: 'mp_preapproval_id' },
  );

  await admin
    .from('pagamento_intencao')
    .update({
      mp_preapproval_id: preId,
      status: intencaoStatusFromPreapproval(status),
      status_detail: null,
    })
    .eq('id', intencaoId);

  return reply({ intencao_id: intencaoId, status, status_detail: null });
}
