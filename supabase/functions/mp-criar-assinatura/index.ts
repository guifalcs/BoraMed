import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

// Inicia o checkout de assinatura recorrente (modelo "com plano associado",
// redirect). Devolve o init_point do plano no Mercado Pago com o
// external_reference do usuário anexado, para o frontend redirecionar.
// A assinatura efetiva é criada/atualizada pelo webhook após o pagamento.
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identidade do chamador
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Buscar o plano
  const { data: plano, error: planoError } = await admin
    .from('plano')
    .select('id, nome, slug, mp_init_point, ativo, recorrente, preco_centavos, frequency')
    .eq('slug', planoSlug)
    .single();
  if (planoError || !plano) return reply({ error: 'plano não encontrado' }, 404);
  if (!plano.ativo) return reply({ error: 'plano inativo' }, 400);

  // Bloqueia enquanto houver ACESSO ativo, evitando cobrança dupla:
  //  - recorrente 'authorized' com proxima_cobranca futura/nula; OU
  //  - 'cancelled' ainda em carência (proxima_cobranca futura) — acesso já pago
  //    segue valendo, reassinar agora cobraria de novo sobre o período pago; OU
  //  - acesso único 'authorized' ainda dentro do prazo (proxima_cobranca futura).
  // Só libera reassinar/recomprar quando o acesso de fato terminou.
  const now = Date.now();
  const { data: assinaturas } = await admin
    .from('assinatura')
    .select('status, proxima_cobranca')
    .eq('user_id', user.id)
    .in('status', ['authorized', 'cancelled']);
  const temAcesso = (assinaturas ?? []).some((a) => {
    const proxima = a.proxima_cobranca ? new Date(a.proxima_cobranca).getTime() : null;
    if (a.status === 'authorized') return proxima === null || proxima > now;
    // cancelled: só conta enquanto em carência (data futura)
    return proxima !== null && proxima > now;
  });
  if (temAcesso) return reply({ error: 'Você já tem um acesso ativo no momento.' }, 409);

  // --- Plano recorrente: redirect para o init_point do plano (preapproval) ---
  if (plano.recorrente) {
    if (!plano.mp_init_point) return reply({ error: 'plano sem mp_init_point configurado' }, 500);
    const sep = plano.mp_init_point.includes('?') ? '&' : '?';
    const initPoint = `${plano.mp_init_point}${sep}external_reference=${encodeURIComponent(user.id)}`;
    return reply({ init_point: initPoint });
  }

  // --- Pagamento único parcelável: cria uma preferência (Checkout Pro) ---
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);
  // Em produção, APP_URL é o domínio público (https) → retorno direto na app.
  // Em dev (localhost), cai no redirecionador mp-retorno que devolve ao localhost.
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const retornoUrl = appUrl.startsWith('https://')
    ? `${appUrl}/assinatura/retorno`
    : `${supabaseUrl}/functions/v1/mp-retorno`;

  const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
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
});
