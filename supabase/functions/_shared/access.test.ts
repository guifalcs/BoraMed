import { assertEquals } from '@std/assert';
import { hasActiveAccess } from './access.ts';

const NOW = new Date('2026-06-24T12:00:00.000Z').getTime();
const FUTURO = '2026-12-24T12:00:00.000Z';
const PASSADO = '2026-01-01T12:00:00.000Z';

Deno.test('hasActiveAccess: false quando não há linhas', () => {
  assertEquals(hasActiveAccess([], NOW), false);
});

Deno.test('hasActiveAccess: authorized com proxima_cobranca futura → true', () => {
  assertEquals(hasActiveAccess([{ status: 'authorized', proxima_cobranca: FUTURO }], NOW), true);
});

Deno.test('hasActiveAccess: authorized com proxima_cobranca nula → true (sem fim)', () => {
  assertEquals(hasActiveAccess([{ status: 'authorized', proxima_cobranca: null }], NOW), true);
});

Deno.test('hasActiveAccess: authorized já expirado → false', () => {
  assertEquals(hasActiveAccess([{ status: 'authorized', proxima_cobranca: PASSADO }], NOW), false);
});

Deno.test('hasActiveAccess: cancelled em carência (futuro) → true', () => {
  assertEquals(hasActiveAccess([{ status: 'cancelled', proxima_cobranca: FUTURO }], NOW), true);
});

Deno.test('hasActiveAccess: cancelled sem data ou no passado → false', () => {
  assertEquals(hasActiveAccess([{ status: 'cancelled', proxima_cobranca: null }], NOW), false);
  assertEquals(hasActiveAccess([{ status: 'cancelled', proxima_cobranca: PASSADO }], NOW), false);
});

Deno.test('hasActiveAccess: basta uma linha ativa entre várias', () => {
  const rows = [
    { status: 'cancelled', proxima_cobranca: PASSADO },
    { status: 'authorized', proxima_cobranca: FUTURO },
  ];
  assertEquals(hasActiveAccess(rows, NOW), true);
});
