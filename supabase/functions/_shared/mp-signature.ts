// Funções puras de webhook do Mercado Pago — sem efeitos colaterais, fáceis de
// testar isoladamente. Usadas pelo mp-webhook.

/**
 * Valida o header `x-signature` do Mercado Pago.
 * Recalcula o HMAC-SHA256 do manifest e compara, em tempo constante, com o `v1`.
 * Manifest: `id:<data.id minúsculo>;request-id:<x-request-id>;ts:<ts>;`
 * (partes ausentes são omitidas do manifest).
 */
export async function verifyMpSignature(
  req: Request,
  dataId: string,
  secret: string,
): Promise<boolean> {
  const xSignature = req.headers.get('x-signature') ?? '';
  const xRequestId = req.headers.get('x-request-id') ?? '';

  // x-signature: "ts=1704908010,v1=hex..."
  const parts = Object.fromEntries(
    xSignature.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    }),
  ) as Record<string, string>;
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const computed = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparação em tempo constante
  if (computed.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

export type PagamentoStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'rejected'
  | 'refunded'
  | 'cancelled'
  | 'charged_back';

/**
 * Mapeia o status de um `authorized_payment` (parcela de assinatura recorrente)
 * para o enum da tabela `pagamento`. Estorno/chargeback são preservados para
 * refletir corretamente no financeiro; estados intermediários viram in_process.
 */
export function mapAuthorizedPaymentStatus(apStatus: string): PagamentoStatus {
  switch (apStatus) {
    case 'processed':
      return 'approved';
    case 'recycling':
      return 'rejected';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'charged_back';
    case 'cancelled':
      return 'cancelled';
    case 'waiting for gateway':
    case 'scheduled':
      return 'in_process';
    default:
      return 'pending';
  }
}
