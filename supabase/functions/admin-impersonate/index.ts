import { createClient } from '@supabase/supabase-js';

// Origens permitidas para CORS. Configure APP_ALLOWED_ORIGINS (lista separada por
// vírgula) nos secrets da função para travar na origem do app. Sem a env, cai para a
// origem oficial de produção (nunca `*`).
const DEFAULT_ORIGIN = 'https://boramedoficial.com.br';
const ALLOWED_ORIGINS = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowList = ALLOWED_ORIGINS.length === 0 ? [DEFAULT_ORIGIN] : ALLOWED_ORIGINS;
  const allowOrigin = allowList.includes(origin) ? origin : allowList[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return reply({ error: 'method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verificar identidade do chamador via JWT
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const caller = callerData.user;

  // Usar service role para operações admin
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verificar papel do chamador (admin ou super_admin)
  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('papel')
    .eq('id', caller.id)
    .single();
  const callerPapel = callerProfile?.papel as string | undefined;
  if (callerPapel !== 'admin' && callerPapel !== 'super_admin') {
    return reply({ error: 'forbidden' }, 403);
  }

  // Validar body
  let body: { target_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const targetUserId = body.target_user_id;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return reply({ error: 'invalid target_user_id' }, 400);
  }
  if (targetUserId === caller.id) {
    return reply({ error: 'cannot impersonate yourself' }, 400);
  }

  // Buscar usuário alvo
  const { data: targetUserData, error: targetError } = await adminClient.auth.admin.getUserById(targetUserId);
  if (targetError || !targetUserData.user) return reply({ error: 'target user not found' }, 404);
  const targetUser = targetUserData.user;

  // Buscar perfil do alvo
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('papel, nome_completo')
    .eq('id', targetUserId)
    .single();
  const targetPapel = targetProfile?.papel as string | undefined;

  // super_admin é irrepresentável
  if (targetPapel === 'super_admin') {
    return reply({ error: 'cannot impersonate super_admin account' }, 403);
  }
  // admin só pode impersonar alunos; super_admin pode impersonar admins também
  if (targetPapel === 'admin' && callerPapel !== 'super_admin') {
    return reply({ error: 'cannot impersonate admin account' }, 403);
  }

  // Registrar audit log ANTES de emitir o token. Se a auditoria falhar, a
  // impersonação é abortada — nunca impersonar sem registro.
  const { error: auditError } = await adminClient.from('admin_impersonation_log').insert({
    admin_id: caller.id,
    admin_email: caller.email ?? '',
    target_id: targetUserId,
    target_email: targetUser.email ?? '',
    target_name: targetProfile?.nome_completo ?? null,
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? null,
    user_agent: req.headers.get('user-agent') ?? null,
  });
  if (auditError) {
    console.error('audit log error:', auditError.message);
    return reply({ error: 'failed to record audit log' }, 500);
  }

  // Gerar magic link (somente após a auditoria estar persistida)
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetUser.email!,
  });
  if (linkError || !linkData) return reply({ error: 'failed to generate link' }, 500);

  const tokenHash = (linkData as { properties?: { hashed_token?: string } }).properties?.hashed_token;
  if (!tokenHash) return reply({ error: 'failed to extract token' }, 500);

  return reply({
    token_hash: tokenHash,
    target_user_id: targetUserId,
    target_email: targetUser.email,
    target_name: targetProfile?.nome_completo ?? null,
  });
});
