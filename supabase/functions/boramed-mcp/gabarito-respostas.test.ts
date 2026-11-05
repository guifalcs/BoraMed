import { assertEquals, assertThrows } from '@std/assert';
import { parseRespostasGabarito } from './gabarito-respostas.ts';

Deno.test('sequência corrida com anulada e em análise', () => {
  const f = parseRespostasGabarito('AB X?e', 5);
  assertEquals(f.map((q) => q.resposta), ['A', 'B', null, null, 'E']);
  assertEquals(f.map((q) => q.anulada), [false, false, true, false, false]);
  assertEquals(f.map((q) => q.numero), [1, 2, 3, 4, 5]);
});

Deno.test('numeração define a posição e ignora palavras', () => {
  const f = parseRespostasGabarito('Gabarito da prova: 1-A, 3) C e 2. anulada', 5);
  assertEquals(f.map((q) => [q.resposta, q.anulada]), [['A', false], [null, true], ['C', false]]);
});

Deno.test('recusa letra fora das alternativas na sequência corrida', () => {
  assertThrows(() => parseRespostasGabarito('ABE', 4), Error, 'Caractere inválido');
});

Deno.test('recusa mais de 200 questões e sequência vazia', () => {
  assertThrows(() => parseRespostasGabarito('A'.repeat(201), 5), Error, '200');
  assertThrows(() => parseRespostasGabarito('   ', 5), Error, 'Nenhuma');
});
