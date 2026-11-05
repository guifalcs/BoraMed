import { consumirDestinoPosLogin, destinoPermitido, salvarDestinoPosLogin } from './destino-pos-login.util';

describe('destino-pos-login.util', () => {
  beforeEach(() => localStorage.clear());

  it('só aceita caminhos internos de gabarito', () => {
    expect(destinoPermitido('/dashboard/gabaritos/n2-3-periodo-2026-2')).toBe(true);
    expect(destinoPermitido('/dashboard/gabaritos')).toBe(true);
    expect(destinoPermitido('//evil.com')).toBe(false);
    expect(destinoPermitido('https://evil.com/dashboard/gabaritos/x')).toBe(false);
    expect(destinoPermitido('/dashboard/assinatura')).toBe(false);
    expect(destinoPermitido('/dashboard/gabaritos/../admin')).toBe(false);
  });

  it('guarda, consome uma vez e apaga', () => {
    salvarDestinoPosLogin('/dashboard/gabaritos/n2-3-periodo-2026-2', 1000);
    expect(consumirDestinoPosLogin(2000)).toBe('/dashboard/gabaritos/n2-3-periodo-2026-2');
    expect(consumirDestinoPosLogin(3000)).toBeNull();
  });

  it('expira em 24h', () => {
    salvarDestinoPosLogin('/dashboard/gabaritos/x', 0);
    expect(consumirDestinoPosLogin(24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it('ignora destino não permitido e JSON corrompido', () => {
    salvarDestinoPosLogin('/admin', 0);
    expect(consumirDestinoPosLogin(1)).toBeNull();
    localStorage.setItem('bm-destino-pos-login', '{quebrado');
    expect(consumirDestinoPosLogin(1)).toBeNull();
  });
});
