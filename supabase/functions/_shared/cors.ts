// Helpers de CORS e resposta JSON compartilhados pelas edge functions.
//
// Configure `APP_ALLOWED_ORIGINS` (lista separada por vírgula) nos secrets para
// travar nas origens do app:
//   npx supabase secrets set APP_ALLOWED_ORIGINS=https://boramed.com.br,https://www.boramed.com.br
//
// Comportamento:
//   * env configurada + origem na lista  → ecoa a origem (permitido);
//   * env configurada + origem fora dela → OMITE Access-Control-Allow-Origin,
//     de modo que o navegador bloqueia a resposta;
//   * env ausente/vazia                  → `*` + aviso no log.
//
// O modo permissivo é mantido como fallback porque estas funções não usam
// cookies: a autorização vem do header `Authorization` (JWT), que uma página de
// terceiro não consegue preencher com o token da vítima. Ou seja, `*` aqui não
// expõe sessão. Ainda assim, PRODUÇÃO DEVE DEFINIR `APP_ALLOWED_ORIGINS` —
// o aviso abaixo existe para que a ausência apareça nos logs.
const ALLOWED_ORIGINS = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Aviso emitido uma única vez por instância do worker (evita poluir o log).
let avisouOrigensAbertas = false;

/**
 * Resolve os headers de CORS a partir da origem do request e da lista de
 * origens permitidas. Função PURA (sem env, sem log) para ser testável direto.
 */
export function resolveCorsHeaders(
  origin: string,
  allowedOrigins: readonly string[],
): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };

  // Lista vazia = modo permissivo (ver nota no topo do arquivo).
  if (allowedOrigins.length === 0) {
    return { ...base, 'Access-Control-Allow-Origin': '*' };
  }

  // Origem desconhecida: não emitir o header. Antes devolvia allowedOrigins[0],
  // o que fazia a resposta parecer liberada para uma origem que não era a do
  // requisitante — confuso no debug e sem valor de segurança.
  if (!allowedOrigins.includes(origin)) {
    return base;
  }

  return { ...base, 'Access-Control-Allow-Origin': origin };
}

export function corsHeaders(req: Request): Record<string, string> {
  if (ALLOWED_ORIGINS.length === 0 && !avisouOrigensAbertas) {
    avisouOrigensAbertas = true;
    console.warn(
      'APP_ALLOWED_ORIGINS não configurada — CORS liberado para qualquer origem (*). ' +
        'Defina o secret para restringir às origens do app.',
    );
  }
  return resolveCorsHeaders(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS);
}

export function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
