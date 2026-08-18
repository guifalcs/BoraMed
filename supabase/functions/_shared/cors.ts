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
//   * env ausente/vazia + ambiente dev/local → `*` + aviso no log
//     (conveniência local, sem depender de configurar o secret);
//   * env ausente/vazia + qualquer outro ambiente → FAIL CLOSED: OMITE
//     Access-Control-Allow-Origin (nenhuma origem é liberada) + erro no log.
//     Produção NUNCA deve depender do `*` implícito.
const ALLOWED_ORIGINS = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Detecta ambiente de desenvolvimento/local a partir de envs comuns. */
function isDevEnvironment(): boolean {
  const env = (Deno.env.get('DENO_ENV') ?? Deno.env.get('ENVIRONMENT') ?? '')
    .trim()
    .toLowerCase();
  return env === 'dev' || env === 'development' || env === 'local';
}

// Aviso emitido uma única vez por instância do worker (evita poluir o log).
let avisouOrigensAbertas = false;

/**
 * Resolve os headers de CORS a partir da origem do request e da lista de
 * origens permitidas. Função PURA (sem env, sem log) para ser testável direto.
 */
export function resolveCorsHeaders(
  origin: string,
  allowedOrigins: readonly string[],
  /**
   * Só usado quando `allowedOrigins` está vazio: se `true`, aplica o modo
   * permissivo (`*`); se `false`, fail-closed (omite o header). Default
   * `true` para preservar o comportamento em dev/local sem exigir o param em
   * todo call-site.
   */
  permissiveWildcard = true,
): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };

  // Lista vazia: modo permissivo (dev/local) ou fail-closed (demais
  // ambientes) — ver nota no topo do arquivo.
  if (allowedOrigins.length === 0) {
    return permissiveWildcard ? { ...base, 'Access-Control-Allow-Origin': '*' } : base;
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
  if (ALLOWED_ORIGINS.length === 0) {
    const dev = isDevEnvironment();
    if (!avisouOrigensAbertas) {
      avisouOrigensAbertas = true;
      if (dev) {
        console.warn(
          'APP_ALLOWED_ORIGINS não configurada — CORS liberado para qualquer origem (*) ' +
            '(ambiente de dev/local).',
        );
      } else {
        console.error(
          'APP_ALLOWED_ORIGINS não configurada em ambiente não-dev — CORS fail-closed ' +
            '(Access-Control-Allow-Origin omitido). Defina o secret para liberar as origens do app.',
        );
      }
    }
    return resolveCorsHeaders(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS, dev);
  }
  return resolveCorsHeaders(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS);
}

export function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
