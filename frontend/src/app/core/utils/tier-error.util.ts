/**
 * Sentinela devolvida pelos services quando uma RPC recusa a chamada com
 * ERRCODE P0015 (`tier_upgrade_required: recurso disponivel apenas no plano
 * Avancado`) — usado por `gerar_simulado_personalizado`, `gerar_simulado_impressao`,
 * `iniciar_tentativa` (provas não-nacionais) e `get_simulado_impressao`
 * (provas prontas não-nacionais). Ver migration 20260717142000.
 */
export const TIER_UPGRADE_REQUIRED = 'tier_upgrade_required';

/** Detecta se o erro retornado por uma RPC do Supabase é o P0015 acima. */
export function isTierUpgradeError(error: unknown): boolean {
  return extractMessage(error).startsWith(TIER_UPGRADE_REQUIRED);
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}
