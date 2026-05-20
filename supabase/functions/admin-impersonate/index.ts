import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verificar identidade do chamador via JWT
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: 'unauthorized' }, 401);
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
    return json({ error: 'forbidden' }, 403);
  }

  // Validar body
  let body: { target_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  const targetUserId = body.target_user_id;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return json({ error: 'invalid target_user_id' }, 400);
  }
  if (targetUserId === caller.id) {
    return json({ error: 'cannot impersonate yourself' }, 400);
  }

  // Buscar usuário alvo
  const { data: targetUserData, error: targetError } = await adminClient.auth.admin.getUserById(targetUserId);
  if (targetError || !targetUserData.user) return json({ error: 'target user not found' }, 404);
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
    return json({ error: 'cannot impersonate super_admin account' }, 403);
  }
  // admin só pode impersonar alunos; super_admin pode impersonar admins também
  if (targetPapel === 'admin' && callerPapel !== 'super_admin') {
    return json({ error: 'cannot impersonate admin account' }, 403);
  }

  // Gerar magic link
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetUser.email!,
  });
  if (linkError || !linkData) return json({ error: 'failed to generate link' }, 500);

  const tokenHash = (linkData as { properties?: { hashed_token?: string } }).properties?.hashed_token;
  if (!tokenHash) return json({ error: 'failed to extract token' }, 500);

  // Registrar audit log (não bloqueia em caso de erro)
  adminClient
    .from('admin_impersonation_log')
    .insert({
      admin_id: caller.id,
      admin_email: caller.email ?? '',
      target_id: targetUserId,
      target_email: targetUser.email ?? '',
      target_name: targetProfile?.nome_completo ?? null,
      ip:
        req.headers.get('x-forwarded-for') ??
        req.headers.get('cf-connecting-ip') ??
        null,
      user_agent: req.headers.get('user-agent') ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('audit log error:', error.message);
    });

  return json({
    token_hash: tokenHash,
    target_email: targetUser.email,
    target_name: targetProfile?.nome_completo ?? null,
  });
});
