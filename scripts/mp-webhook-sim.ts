#!/usr/bin/env -S deno run --allow-net --allow-env
// Simulador de webhook do Mercado Pago para a função `mp-webhook`.
// Monta o header `x-signature` com o mesmo HMAC-SHA256 que a função valida e
// dispara um POST. Serve para testar a validação de assinatura, o roteamento por
// `type` e o replay de eventos reais do ambiente de TESTE.
//
// IMPORTANTE: a função `mp-webhook`, ao receber o evento, BUSCA o recurso na API
// do Mercado Pago (preapproval / payment / authorized_payment) usando o
// MP_ACCESS_TOKEN configurado. Portanto, para que o upsert de fato aconteça, o
// `--id` precisa ser de um recurso REAL na sua conta de teste (ex.: o
// preapproval_id devolvido num checkout de teste). Com um id inventado, a função
// valida a assinatura, mas o MP GET falha e nada é gravado (responde 200).
//
// Uso:
//   deno run --allow-net --allow-env scripts/mp-webhook-sim.ts \
//     --url http://127.0.0.1:54321/functions/v1/mp-webhook \
//     --secret "$MP_WEBHOOK_SECRET" \
//     --type subscription_preapproval \
//     --id <preapproval_id_real_de_teste>
//
// Tipos suportados pela função:
//   subscription_preapproval | subscription_authorized_payment | payment
//
// Para testar a REJEIÇÃO de assinatura inválida: passe --secret errado e espere 401.

function arg(name: string, fallback?: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < Deno.args.length) return Deno.args[i + 1];
  return fallback;
}

const url = arg('url', 'http://127.0.0.1:54321/functions/v1/mp-webhook')!;
const secret = arg('secret', Deno.env.get('MP_WEBHOOK_SECRET'));
const type = arg('type', 'payment')!;
const id = arg('id');
const requestId = arg('request-id', crypto.randomUUID())!;
const ts = arg('ts', String(Math.floor(Date.now() / 1000)))!;

if (!secret) {
  console.error('Faltou --secret (ou env MP_WEBHOOK_SECRET).');
  Deno.exit(1);
}
if (!id) {
  console.error('Faltou --id (data.id do recurso). Use um id real do MP test para gravar.');
  Deno.exit(1);
}

// Manifest idêntico ao da função: id:<lower>;request-id:<id>;ts:<ts>;
const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`;

const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);
const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
const v1 = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const body = JSON.stringify({ type, data: { id } });

console.log('→ POST', url);
console.log('  type        :', type);
console.log('  data.id     :', id);
console.log('  x-request-id:', requestId);
console.log('  manifest    :', manifest);

const res = await fetch(`${url}?type=${encodeURIComponent(type)}&data.id=${encodeURIComponent(id)}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': requestId,
  },
  body,
});

console.log('← status', res.status, await res.text());
