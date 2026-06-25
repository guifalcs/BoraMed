import { createClient } from '@supabase/supabase-js';
import { corsHeaders, json } from '../_shared/cors.ts';

// Cancela ou pausa a assinatura do próprio usuário no Mercado Pago.
// A confirmação final do novo status chega via webhook, mas atualizamos
// otimisticamente para refletir na UI imediatamente.
const MP_API = 'https://api.mercadopago.com';

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
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  let body: { acao?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const acao = body.acao;
  if (acao !== 'cancelar' && acao !== 'pausar' && acao !== 'reativar') {
    return reply({ error: 'acao inválida (cancelar | pausar | reativar)' }, 400);
  }
  const novoStatus = acao === 'cancelar' ? 'cancelled' : acao === 'pausar' ? 'paused' : 'authorized';

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pega a assinatura do usuário (a mais recente não cancelada)
  const { data: assin, error: assinError } = await admin
    .from('assinatura')
    .select('id, mp_preapproval_id, status')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assinError || !assin || !assin.mp_preapproval_id) {
    return reply({ error: 'assinatura não encontrada' }, 404);
  }

  // PUT /preapproval/{id} com o novo status
  const mpRes = await fetch(`${MP_API}/preapproval/${assin.mp_preapproval_id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${mpToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: novoStatus }),
  });
  const mpData = await mpRes.json().catch(() => ({}));
  if (!mpRes.ok) {
    console.error('MP PUT preapproval error:', mpRes.status, JSON.stringify(mpData));
    return reply({ error: 'falha ao atualizar assinatura no Mercado Pago', detail: mpData }, 502);
  }

  await admin
    .from('assinatura')
    .update({
      status: novoStatus,
      cancelada_em: novoStatus === 'cancelled' ? new Date().toISOString() : null,
    })
    .eq('id', assin.id);

  return reply({ status: novoStatus });
});
