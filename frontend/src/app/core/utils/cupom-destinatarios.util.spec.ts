import { extrairEmails, normalizarEmail } from './cupom-destinatarios.util';

describe('cupom-destinatarios.util', () => {
  describe('normalizarEmail', () => {
    it('remove espaços e põe em minúsculas', () => {
      expect(normalizarEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    });
  });

  describe('extrairEmails', () => {
    it('separa por vírgula, ponto e vírgula, espaço e quebra de linha', () => {
      const r = extrairEmails('a@x.com, b@x.com;c@x.com\nd@x.com e@x.com\r\nf@x.com');
      expect(r.validos).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com']);
      expect(r.invalidos).toEqual([]);
    });

    it('normaliza e remove repetidos ignorando maiúsculas', () => {
      const r = extrairEmails('Ana@X.com ana@x.COM');
      expect(r.validos).toEqual(['ana@x.com']);
    });

    it('separa o que não é e-mail em `invalidos`', () => {
      const r = extrairEmails('ok@x.com, semarroba, @x.com, a@b, b@c.com');
      expect(r.validos).toEqual(['ok@x.com', 'b@c.com']);
      expect(r.invalidos).toEqual(['semarroba', '@x.com', 'a@b']);
    });

    it('texto vazio ou só separadores não gera nada', () => {
      expect(extrairEmails('')).toEqual({ validos: [], invalidos: [] });
      expect(extrairEmails(' ,;\n ')).toEqual({ validos: [], invalidos: [] });
    });
  });
});
