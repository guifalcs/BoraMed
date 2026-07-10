// Cenário 4 (server-side): com acesso ativo, POST mp-processar-assinatura
// deve responder 409 sem criar preapproval. Usa card token real (public key TEST).
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const envLocal = readFileSync(
  new URL('../../frontend/src/environments/environment.local.ts', import.meta.url),
  'utf8'
);
const publicKey = envLocal.match(/mercadoPagoPublicKey:\s*'([^']+)'/)?.[1];
if (!publicKey?.startsWith('TEST-')) throw new Error('public key TEST não encontrada');

const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SB = 'http://127.0.0.1:54321';

// 1. Login
const auth = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'teste@boramed.com', password: 'Teste123!' }),
}).then((r) => r.json());
if (!auth.access_token) throw new Error('login falhou: ' + JSON.stringify(auth).slice(0, 200));
console.log('LOGIN OK');

// 2. Card token (mesma chamada que o Brick faz)
const tok = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${publicKey}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    card_number: '5031433215406351',
    expiration_month: 11,
    expiration_year: 2030,
    security_code: '123',
    cardholder: { name: 'APRO', identification: { type: 'CPF', number: '12345678909' } },
  }),
}).then((r) => r.json());
if (!tok.id) throw new Error('card token falhou: ' + JSON.stringify(tok).slice(0, 300));
console.log('CARD TOKEN OK');

// 3. Edge — espera 409 (acesso ativo)
const res = await fetch(`${SB}/functions/v1/mp-processar-assinatura`, {
  method: 'POST',
  headers: {
    apikey: ANON,
    authorization: `Bearer ${auth.access_token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    attempt_id: randomUUID(),
    plano_slug: 'mensal',
    card_token_id: tok.id,
  }),
});
console.log('HTTP', res.status);
console.log('BODY', JSON.stringify(await res.json()));
