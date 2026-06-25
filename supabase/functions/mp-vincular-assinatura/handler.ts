import type { Deps } from '../_shared/deps.ts';
import { corsHeaders, json } from '../_shared/cors.ts';

// Vincula uma assinatura do Mercado Pago ao usuário autenticado.
// Chamada pela tela /assinatura/retorno com o preapproval_id que o MP devolve
// na back_url após o checkout. O checkout por plano (redirect) não propaga o
// external_reference, então o vínculo é feito aqui, pelo usuário logado que
// acabou de assinar. O webhook cuida das atualizações de status seguintes.
const MP_API = 'https://api.mercadopago.com';

export async function handleVincularAssinatura(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  const mpToken = deps.env('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);

  const callerClient = deps.caller(authHeader);
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  let body: { preapproval_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const preapprovalId = body.preapproval_id;
  if (!preapprovalId || typeof preapprovalId !== 'string') {
    return reply({ error: 'invalid preapproval_id' }, 400);
  }

  // Buscar a assinatura no Mercado Pago
  const mpRes = await deps.fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  if (!mpRes.ok) {
    console.error('MP GET preapproval error:', mpRes.status);
    return reply({ error: 'assinatura não encontrada no Mercado Pago' }, 404);
  }
  const sub = await mpRes.json();
  const status = String(sub['status'] ?? 'pending');
  const planId = sub['preapproval_plan_id'] as string | undefined;
  const nextPayment = (sub['next_payment_date'] as string | undefined) ?? null;

  // O checkout por redirect/plano do MP NÃO preserva external_reference e, no
  // pagamento guest, traz payer_email vazio — então não dá para amarrar a
  // assinatura ao usuário por esses campos. O vínculo confiável é pela SESSÃO
  // autenticada: quem chama esta função acabou de voltar do MP com o
  // preapproval_id, que só aparece na back_url do próprio pagador. A proteção
  // anti-sequestro é a checagem "já vinculada a outra conta" abaixo (primeiro a
  // reivindicar vence; o id é de alta entropia e não enumerável). Quando o
  // payer_email existe e diverge, apenas registramos — não bloqueia.
  const payerEmail = String(sub['payer_email'] ?? '').trim().toLowerCase();
  const userEmail = String(user.email ?? '').trim().toLowerCase();
  if (payerEmail && userEmail && payerEmail !== userEmail) {
    console.warn('mp-vincular: payer_email difere da conta — vinculando pela sessão', {
      preapprovalId,
    });
  }

  const admin = deps.admin();

  // Resolver o plano pelo preapproval_plan_id (garante que é uma assinatura nossa)
  let planoId: string | null = null;
  if (planId) {
    const { data: plano } = await admin
      .from('plano')
      .select('id')
      .eq('mp_preapproval_plan_id', planId)
      .maybeSingle();
    planoId = plano?.id ?? null;
  }
  if (!planoId) return reply({ error: 'assinatura não corresponde a um plano do BoraMed' }, 400);

  // Impede sequestrar a assinatura de outro usuário
  const { data: existente } = await admin
    .from('assinatura')
    .select('id, user_id')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();
  if (existente && existente.user_id !== user.id) {
    return reply({ error: 'assinatura já vinculada a outra conta' }, 409);
  }

  const { error: upsertError } = await admin.from('assinatura').upsert(
    {
      user_id: user.id,
      plano_id: planoId,
      mp_preapproval_id: preapprovalId,
      status,
      proxima_cobranca: nextPayment,
      data_inicio: (sub['date_created'] as string | undefined) ?? null,
      cancelada_em: status === 'cancelled' ? deps.now().toISOString() : null,
    },
    { onConflict: 'mp_preapproval_id' },
  );
  if (upsertError) {
    console.error('assinatura upsert error:', upsertError.message);
    return reply({ error: 'falha ao vincular assinatura' }, 500);
  }

  return reply({ status });
}
