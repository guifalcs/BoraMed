import type { Deps } from '../_shared/deps.ts';
import { hasActiveAccess } from '../_shared/access.ts';
import { corsHeaders, json } from '../_shared/cors.ts';

// Inicia o checkout de assinatura recorrente (modelo "com plano associado",
// redirect). Devolve o init_point do plano no Mercado Pago com o
// external_reference do usuário anexado, para o frontend redirecionar.
// A assinatura efetiva é criada/atualizada pelo webhook após o pagamento.
export async function handleCriarAssinatura(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  // Identidade do chamador
  const callerClient = deps.caller(authHeader);
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  // Body
  let body: { plano_slug?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const planoSlug = body.plano_slug;
  if (!planoSlug || typeof planoSlug !== 'string') {
    return reply({ error: 'invalid plano_slug' }, 400);
  }

  const admin = deps.admin();

  // Buscar o plano
  const { data: plano, error: planoError } = await admin
    .from('plano')
    .select('id, nome, slug, mp_init_point, ativo, recorrente, preco_centavos, frequency, frequency_type, moeda')
    .eq('slug', planoSlug)
    .single();
  if (planoError || !plano) return reply({ error: 'plano não encontrado' }, 404);
  if (!plano.ativo) return reply({ error: 'plano inativo' }, 400);

  // Bloqueia enquanto houver ACESSO ativo, evitando cobrança dupla.
  // Só libera reassinar/recomprar quando o acesso de fato terminou.
  const { data: assinaturas } = await admin
    .from('assinatura')
    .select('status, proxima_cobranca')
    .eq('user_id', user.id)
    .in('status', ['authorized', 'cancelled']);
  if (hasActiveAccess(assinaturas ?? [], deps.now().getTime())) {
    return reply({ error: 'Você já tem um acesso ativo no momento.' }, 409);
  }

  // Config compartilhada do checkout.
  const mpToken = deps.env('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);
  const supabaseUrl = deps.env('SUPABASE_URL')!;
  // Em produção, APP_URL é o domínio público (https) → retorno direto na app.
  // Em dev (localhost), cai no redirecionador mp-retorno que devolve ao localhost.
  const appUrl = (deps.env('APP_URL') ?? '').replace(/\/$/, '');
  const retornoUrl = appUrl.startsWith('https://')
    ? `${appUrl}/assinatura/retorno`
    : `${supabaseUrl}/functions/v1/mp-retorno`;

  // --- Plano recorrente: cria um preapproval SEM plano associado, com
  // external_reference embutido. Ao contrário do redirect via init_point do
  // plano (que o MP descarta), aqui o MP PERSISTE o external_reference — então o
  // webhook resolve o usuário sozinho, sem depender do retorno do usuário à
  // back_url. A assinatura é criada já em 'pending' (a linha existe desde o
  // início; o webhook apenas a promove a 'authorized'). O preço vem do nosso
  // banco, não de um plano fixo no MP.
  if (plano.recorrente) {
    const preRes = await deps.fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `BoraMed ${plano.nome}`,
        external_reference: user.id,
        payer_email: user.email,
        back_url: retornoUrl,
        status: 'pending',
        auto_recurring: {
          frequency: plano.frequency,
          frequency_type: plano.frequency_type,
          transaction_amount: plano.preco_centavos / 100,
          currency_id: plano.moeda ?? 'BRL',
        },
      }),
    });
    const pre = await preRes.json().catch(() => ({}));
    if (!preRes.ok || !pre.id || !pre.init_point) {
      console.error('MP preapproval error:', preRes.status, JSON.stringify(pre));
      return reply({ error: 'falha ao criar assinatura', detail: pre }, 502);
    }
    // Cria a assinatura já vinculada (pending). O webhook só promove o status.
    await admin.from('assinatura').upsert(
      {
        user_id: user.id,
        plano_id: plano.id,
        mp_preapproval_id: pre.id,
        status: 'pending',
        cancelada_em: null,
      },
      { onConflict: 'mp_preapproval_id' },
    );
    return reply({ init_point: pre.init_point });
  }

  // --- Pagamento único parcelável: cria uma preferência (Checkout Pro) ---
  const prefRes = await deps.fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          title: `BoraMed ${plano.nome}`,
          quantity: 1,
          unit_price: plano.preco_centavos / 100,
          currency_id: 'BRL',
        },
      ],
      payer: user.email ? { email: user.email } : undefined,
      external_reference: user.id,
      metadata: {
        tipo: 'acesso_unico',
        plano_slug: plano.slug,
        user_id: user.id,
        acesso_meses: plano.frequency,
      },
      back_urls: { success: retornoUrl, pending: retornoUrl, failure: retornoUrl },
      auto_return: 'approved',
      // Parcelamento em até 6x no cartão.
      payment_methods: { installments: 6 },
      notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
    }),
  });
  const pref = await prefRes.json().catch(() => ({}));
  if (!prefRes.ok) {
    console.error('MP preference error:', prefRes.status, JSON.stringify(pref));
    return reply({ error: 'falha ao criar checkout', detail: pref }, 502);
  }
  const initPoint = pref.init_point ?? pref.sandbox_init_point;
  if (!initPoint) return reply({ error: 'checkout sem init_point', detail: pref }, 502);
  return reply({ init_point: initPoint });
}
