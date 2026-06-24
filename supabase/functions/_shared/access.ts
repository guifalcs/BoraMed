// Regra de acesso ativo, compartilhada e pura. Espelha a lógica de
// `tem_assinatura_ativa()` no banco e é usada pelo mp-criar-assinatura para
// bloquear cobrança dupla enquanto ainda há acesso pago vigente.

export interface AcessoRow {
  status: string;
  proxima_cobranca: string | null;
}

/**
 * Há acesso ativo quando:
 *  - assinatura 'authorized' com proxima_cobranca futura OU nula (sem fim); OU
 *  - assinatura 'cancelled' ainda em carência (proxima_cobranca futura).
 * `nowMs` é injetado (Date.now()) para tornar o cálculo determinístico em teste.
 */
export function hasActiveAccess(rows: AcessoRow[], nowMs: number): boolean {
  return rows.some((a) => {
    const proxima = a.proxima_cobranca ? new Date(a.proxima_cobranca).getTime() : null;
    if (a.status === 'authorized') return proxima === null || proxima > nowMs;
    // cancelled: só conta enquanto em carência (data futura)
    return proxima !== null && proxima > nowMs;
  });
}
