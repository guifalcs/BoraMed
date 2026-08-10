/**
 * Sentinelas devolvidas pelos services quando uma RPC recusa a chamada por
 * falta de acesso. Todas resultam em upsell na UI, mas com copy diferente.
 */

/**
 * ERRCODE P0015 (`tier_upgrade_required`): o recurso existe no plano Avançado e
 * o usuário está num nível abaixo. Usado por `gerar_simulado_personalizado`,
 * `gerar_simulado_impressao`, `get_simulado_impressao` e `iniciar_tentativa`
 * (provas não-nacionais). Ver migrations 20260717142000 e 20260801115817.
 */
export const TIER_UPGRADE_REQUIRED = 'tier_upgrade_required';

/**
 * ERRCODE P0016 (`free_limit_reached`): o usuário do plano gratuito esgotou as
 * tentativas vitalícias. Usado por `iniciar_tentativa`. Ver 20260801115817.
 */
export const FREE_LIMIT_REACHED = 'free_limit_reached';

/**
 * ERRCODE P0009 (`subscription_required`): gate binário legado, ainda presente
 * nas RPCs de simulado personalizado e impressão. Para o usuário gratuito é
 * indistinguível de um upsell, então a UI trata igual.
 */
export const SUBSCRIPTION_REQUIRED = 'subscription_required';

/** Detecta o P0015. */
export function isTierUpgradeError(error: unknown): boolean {
  return extractMessage(error).startsWith(TIER_UPGRADE_REQUIRED);
}

/** Detecta o P0016 (limite do plano gratuito esgotado). */
export function isFreeLimitError(error: unknown): boolean {
  return extractMessage(error).startsWith(FREE_LIMIT_REACHED);
}

/**
 * Qualquer recusa por falta de acesso. É o que as telas devem checar para
 * decidir "abrir o paywall" em vez de mostrar erro genérico.
 */
export function isPaywallError(error: unknown): boolean {
  const message = extractMessage(error);
  return (
    message.startsWith(TIER_UPGRADE_REQUIRED) ||
    message.startsWith(FREE_LIMIT_REACHED) ||
    message.startsWith(SUBSCRIPTION_REQUIRED)
  );
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}
