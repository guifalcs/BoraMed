// Funções puras de webhook do Mercado Pago — sem efeitos colaterais, fáceis de
// testar isoladamente. Usadas pelo mp-webhook.

/**
 * Resultado da checagem do `x-signature`:
 *   - `valida`   → HMAC confere; o corpo da notificação é confiável;
 *   - `invalida` → veio assinatura e ela NÃO confere (adulteração) → rejeitar;
 *   - `ausente`  → notificação sem `x-signature`. É o canal IPN legado do MP
 *     (`?id=<id>&topic=<topic>`), que nunca assina. Não é adulteração e não
 *     pode ser descartada: em produção (10/09/2026) TODA transição de status
 *     do Pix do checkout embutido chegou só por esse canal e morreu em 401,
 *     deixando a intenção `pendente` para sempre. Quem trata `ausente` só
 *     pode usar o `id` como GATILHO e reconsultar o recurso na API do MP —
 *     nunca confiar no corpo.
 */
export type MpSignatureCheck = 'valida' | 'invalida' | 'ausente';

/**
 * Classifica o header `x-signature` do Mercado Pago. Mesma verificação do
 * `verifyMpSignature`, distinguindo "não veio assinatura" de "assinatura não
 * confere".
 */
export async function classifyMpSignature(
  req: Request,
  dataId: string,
  secret: string,
): Promise<MpSignatureCheck> {
  if (!req.headers.get('x-signature')) return 'ausente';
  return (await verifyMpSignature(req, dataId, secret)) ? 'valida' : 'invalida';
}

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

/**
 * Traduz o `topic` do IPN legado (`?id=...&topic=payment`) para o `type` do
 * webhook moderno, que é o vocabulário usado no roteamento do handler.
 * Topic desconhecido devolve string vazia — o handler ignora e responde 200.
 */
export function mpTopicToType(topic: string): string {
  switch (topic) {
    case 'payment':
      return 'payment';
    case 'preapproval':
    case 'subscription_preapproval':
      return 'subscription_preapproval';
    case 'authorized_payment':
    case 'subscription_authorized_payment':
      return 'subscription_authorized_payment';
    default:
      return '';
  }
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
