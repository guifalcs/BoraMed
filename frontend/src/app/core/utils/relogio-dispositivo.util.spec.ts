import { describe, expect, it } from 'vitest';
import { avaliarRelogio, descreverDesvio } from './relogio-dispositivo.util';

const IAT = 1_800_000_000;

function token(payload: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `h.${b64}.s`;
}

const tokenUmaHora = token({ iat: IAT, exp: IAT + 3600 });
const agora = (desvioMin: number) => IAT * 1000 + desvioMin * 60_000;

describe('avaliarRelogio', () => {
  it('ignora desvio pequeno', () => {
    expect(avaliarRelogio(tokenUmaHora, agora(2))).toBeNull();
    expect(avaliarRelogio(tokenUmaHora, agora(-4))).toBeNull();
  });

  it('avisa sem marcar crítico quando o aparelho está alguns minutos fora', () => {
    expect(avaliarRelogio(tokenUmaHora, agora(20))).toEqual({ desvioMs: 20 * 60_000, critico: false });
    expect(avaliarRelogio(tokenUmaHora, agora(-90))).toEqual({ desvioMs: -90 * 60_000, critico: false });
  });

  it('marca crítico quando o adiantamento faz o token nascer vencido', () => {
    expect(avaliarRelogio(tokenUmaHora, agora(60))?.critico).toBe(true);
    expect(avaliarRelogio(tokenUmaHora, agora(58))?.critico).toBe(true);
  });

  it('usa a validade real do token no limite crítico', () => {
    const tokenDezMin = token({ iat: IAT, exp: IAT + 600 });
    expect(avaliarRelogio(tokenDezMin, agora(8))?.critico).toBe(true);
  });

  it('retorna null para token ausente ou inválido', () => {
    expect(avaliarRelogio(undefined, agora(60))).toBeNull();
    expect(avaliarRelogio('lixo', agora(60))).toBeNull();
    expect(avaliarRelogio(token({ iat: IAT }), agora(60))).toBeNull();
  });
});

describe('descreverDesvio', () => {
  it('formata horas e minutos com o sentido', () => {
    expect(descreverDesvio(62 * 60_000)).toBe('1 h 2 min adiantado');
    expect(descreverDesvio(60 * 60_000)).toBe('1 h adiantado');
    expect(descreverDesvio(-7 * 60_000)).toBe('7 min atrasado');
  });
});
