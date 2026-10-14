/**
 * Detecta relógio do aparelho fora de hora a partir de um access token recém
 * emitido. O `iat` do JWT é a hora do servidor no momento da emissão; a
 * diferença para `Date.now()` logo depois é o desvio do relógio local.
 *
 * Por que importa: o supabase-js decide se o token venceu comparando o
 * `expires_at` do servidor com o relógio local (margem de 90s). Com o aparelho
 * adiantado perto da validade do token, todo token novo já nasce "vencido",
 * cada request força um refresh, o Supabase devolve 429 no /token e a sessão
 * cai (SIGNED_OUT). Só vale para token recém emitido: um token antigo lido do
 * storage tem `iat` no passado e daria falso positivo.
 */

/** Desvio a partir do qual o usuário é avisado (sessão ainda funciona). */
export const DESVIO_RELOGIO_AVISO_MS = 5 * 60 * 1000;

/** Mesma margem que o auth-js usa para considerar o token vencido. */
const MARGEM_EXPIRACAO_AUTH_JS_MS = 90 * 1000;

/** Folga extra para latência de rede entre a emissão e a leitura. */
const FOLGA_LATENCIA_MS = 60 * 1000;

export interface AvaliacaoRelogio {
  /** Positivo = aparelho adiantado; negativo = atrasado. */
  desvioMs: number;
  /** true quando o desvio derruba a sessão (loop de refresh no auth-js). */
  critico: boolean;
}

export function avaliarRelogio(
  accessToken: string | null | undefined,
  agoraMs: number,
): AvaliacaoRelogio | null {
  const payload = decodificarPayload(accessToken);
  if (!payload) return null;

  const { iat, exp } = payload;
  const desvioMs = agoraMs - iat * 1000;
  if (Math.abs(desvioMs) < DESVIO_RELOGIO_AVISO_MS) return null;

  const validadeMs = (exp - iat) * 1000;
  const limiteCriticoMs = validadeMs - MARGEM_EXPIRACAO_AUTH_JS_MS - FOLGA_LATENCIA_MS;
  return { desvioMs, critico: desvioMs >= limiteCriticoMs };
}

/** Texto curto do desvio para a UI: "1 h 2 min adiantado". */
export function descreverDesvio(desvioMs: number): string {
  const totalMin = Math.round(Math.abs(desvioMs) / 60_000);
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  const partes: string[] = [];
  if (horas > 0) partes.push(`${horas} h`);
  if (minutos > 0 || horas === 0) partes.push(`${minutos} min`);
  return `${partes.join(' ')} ${desvioMs > 0 ? 'adiantado' : 'atrasado'}`;
}

function decodificarPayload(
  accessToken: string | null | undefined,
): { iat: number; exp: number } | null {
  if (!accessToken) return null;
  try {
    const base64 = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(base64));
    if (payload === null || typeof payload !== 'object') return null;
    const { iat, exp } = payload as Record<string, unknown>;
    if (typeof iat !== 'number' || typeof exp !== 'number' || exp <= iat) return null;
    return { iat, exp };
  } catch {
    return null;
  }
}
