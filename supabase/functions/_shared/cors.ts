// Helpers de CORS e resposta JSON compartilhados pelas edge functions.
// Configure APP_ALLOWED_ORIGINS (lista separada por vírgula) nos secrets para
// travar nas origens do app. Sem a env, cai para a origem oficial de produção
// (nunca `*`) — evita CORS aberto por esquecimento de configuração.
const DEFAULT_ORIGIN = 'https://boramedoficial.com.br';
const ALLOWED_ORIGINS = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowList = ALLOWED_ORIGINS.length === 0 ? [DEFAULT_ORIGIN] : ALLOWED_ORIGINS;
  const allowOrigin = allowList.includes(origin) ? origin : allowList[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

export function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
