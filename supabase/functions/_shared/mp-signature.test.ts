import { assertEquals } from '@std/assert';
import {
  classifyMpSignature,
  mapAuthorizedPaymentStatus,
  mpTopicToType,
  verifyMpSignature,
} from './mp-signature.ts';
import { signWebhook } from './test/fake.ts';

const SECRET = 'whsec_test';

function reqWith(signature: string, requestId = 'req-1'): Request {
  return new Request('https://x/functions/v1/mp-webhook', {
    method: 'POST',
    headers: { 'x-signature': signature, 'x-request-id': requestId },
  });
}

Deno.test('verifyMpSignature: aceita assinatura válida', async () => {
  const sig = await signWebhook(SECRET, 'DATA-123', '1700000000', 'req-1');
  assertEquals(await verifyMpSignature(reqWith(sig), 'DATA-123', SECRET), true);
});

Deno.test('verifyMpSignature: rejeita v1 adulterado', async () => {
  const sig = await signWebhook(SECRET, 'DATA-123', '1700000000', 'req-1');
  const adulterado = sig.replace(/v1=.(.*)/, 'v1=0$1'); // troca o 1º char do v1
  assertEquals(await verifyMpSignature(reqWith(adulterado), 'DATA-123', SECRET), false);
});

Deno.test('verifyMpSignature: rejeita secret errado', async () => {
  const sig = await signWebhook(SECRET, 'DATA-123', '1700000000', 'req-1');
  assertEquals(await verifyMpSignature(reqWith(sig), 'DATA-123', 'outro-secret'), false);
});

Deno.test('verifyMpSignature: rejeita quando dataId não bate (manifest diferente)', async () => {
  const sig = await signWebhook(SECRET, 'DATA-123', '1700000000', 'req-1');
  assertEquals(await verifyMpSignature(reqWith(sig), 'DATA-999', SECRET), false);
});

Deno.test('verifyMpSignature: rejeita header sem ts/v1', async () => {
  assertEquals(await verifyMpSignature(reqWith('foo=bar'), 'DATA-123', SECRET), false);
  assertEquals(await verifyMpSignature(reqWith(''), 'DATA-123', SECRET), false);
});

Deno.test('verifyMpSignature: é sensível ao x-request-id (parte do manifest)', async () => {
  const sig = await signWebhook(SECRET, 'DATA-123', '1700000000', 'req-1');
  // mesma assinatura, request-id diferente → manifest diferente → inválido
  assertEquals(await verifyMpSignature(reqWith(sig, 'req-OUTRO'), 'DATA-123', SECRET), false);
});

Deno.test('classifyMpSignature: distingue válida, inválida e ausente', async () => {
  const sig = await signWebhook(SECRET, 'DATA-123', '1700000000', 'req-1');
  assertEquals(await classifyMpSignature(reqWith(sig), 'DATA-123', SECRET), 'valida');
  assertEquals(await classifyMpSignature(reqWith(sig), 'DATA-999', SECRET), 'invalida');

  // IPN legado: nenhum header x-signature. Não é adulteração — é outro canal.
  const semHeader = new Request('https://x/functions/v1/mp-webhook?id=DATA-123&topic=payment', {
    method: 'POST',
  });
  assertEquals(await classifyMpSignature(semHeader, 'DATA-123', SECRET), 'ausente');
});

Deno.test('classifyMpSignature: header presente mas vazio/sem v1 é inválido, não ausente', async () => {
  assertEquals(await classifyMpSignature(reqWith('foo=bar'), 'DATA-123', SECRET), 'invalida');
});

Deno.test('mpTopicToType: traduz os topics do IPN legado', () => {
  assertEquals(mpTopicToType('payment'), 'payment');
  assertEquals(mpTopicToType('preapproval'), 'subscription_preapproval');
  assertEquals(mpTopicToType('authorized_payment'), 'subscription_authorized_payment');
  // Topic fora do nosso escopo (ex.: merchant_order) não vira evento.
  assertEquals(mpTopicToType('merchant_order'), '');
  assertEquals(mpTopicToType(''), '');
});

Deno.test('mapAuthorizedPaymentStatus: mapeia todos os estados conhecidos', () => {
  assertEquals(mapAuthorizedPaymentStatus('processed'), 'approved');
  assertEquals(mapAuthorizedPaymentStatus('recycling'), 'rejected');
  assertEquals(mapAuthorizedPaymentStatus('refunded'), 'refunded');
  assertEquals(mapAuthorizedPaymentStatus('charged_back'), 'charged_back');
  assertEquals(mapAuthorizedPaymentStatus('waiting for gateway'), 'in_process');
  assertEquals(mapAuthorizedPaymentStatus('scheduled'), 'in_process');
});

Deno.test('mapAuthorizedPaymentStatus: estado desconhecido vira pending', () => {
  assertEquals(mapAuthorizedPaymentStatus('qualquer_coisa'), 'pending');
  assertEquals(mapAuthorizedPaymentStatus(''), 'pending');
});
