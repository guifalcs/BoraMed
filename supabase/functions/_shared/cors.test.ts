import { assertEquals } from '@std/assert';
import { resolveCorsHeaders } from './cors.ts';

// `corsHeaders(req)` lê APP_ALLOWED_ORIGINS no load do módulo; a lógica de
// decisão vive em `resolveCorsHeaders`, que é pura e recebe a lista pronta.

const APP = 'https://boramed.com.br';
const WWW = 'https://www.boramed.com.br';
const PERMITIDAS = [APP, WWW];

Deno.test('lista vazia: modo permissivo (*)', () => {
  const h = resolveCorsHeaders('https://qualquer.invalido', []);
  assertEquals(h['Access-Control-Allow-Origin'], '*');
});

Deno.test('origem na lista: ecoa a própria origem', () => {
  assertEquals(resolveCorsHeaders(APP, PERMITIDAS)['Access-Control-Allow-Origin'], APP);
  assertEquals(resolveCorsHeaders(WWW, PERMITIDAS)['Access-Control-Allow-Origin'], WWW);
});

Deno.test('origem fora da lista: omite Access-Control-Allow-Origin', () => {
  const h = resolveCorsHeaders('https://atacante.invalido', PERMITIDAS);
  assertEquals(h['Access-Control-Allow-Origin'], undefined);
  // Regressão: antes devolvia PERMITIDAS[0], sugerindo liberação indevida.
  assertEquals(h['Vary'], 'Origin');
});

Deno.test('request sem header Origin não é liberado quando há lista', () => {
  assertEquals(resolveCorsHeaders('', PERMITIDAS)['Access-Control-Allow-Origin'], undefined);
});

Deno.test('sempre expõe allow-headers e Vary', () => {
  for (const h of [resolveCorsHeaders(APP, PERMITIDAS), resolveCorsHeaders('x', [])]) {
    assertEquals(
      h['Access-Control-Allow-Headers'],
      'authorization, x-client-info, apikey, content-type',
    );
    assertEquals(h['Vary'], 'Origin');
  }
});
