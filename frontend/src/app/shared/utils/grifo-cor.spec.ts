import { describe, expect, it } from 'vitest';
import {
  corDoTextoSobre,
  cursorBorracha,
  cursorCaneta,
  nomeHighlight,
  regraHighlight,
} from './grifo-cor';
import { CORES_PADRAO } from './grifo';

describe('nomeHighlight', () => {
  it('vira um identificador de CSS válido (sem o #)', () => {
    expect(nomeHighlight('#fde68a')).toBe('bm-grifo-fde68a');
  });

  it('não colide entre cores diferentes', () => {
    const nomes = new Set(CORES_PADRAO.map(nomeHighlight));
    expect(nomes.size).toBe(CORES_PADRAO.length);
  });
});

describe('corDoTextoSobre', () => {
  it('usa texto escuro sobre os pastéis da paleta', () => {
    for (const cor of CORES_PADRAO) {
      expect(corDoTextoSobre(cor)).toBe('#0f172a');
    }
  });

  it('vira texto branco quando o aluno escolhe uma cor escura', () => {
    // Sem isso, escolher um roxo forte no espectro apagaria o enunciado.
    expect(corDoTextoSobre('#3b0764')).toBe('#ffffff');
    expect(corDoTextoSobre('#000000')).toBe('#ffffff');
  });

  it('mantém texto escuro no branco e no amarelo puro', () => {
    expect(corDoTextoSobre('#ffffff')).toBe('#0f172a');
    expect(corDoTextoSobre('#ffff00')).toBe('#0f172a');
  });
});

describe('regraHighlight', () => {
  it('monta a regra ::highlight() da cor com o texto legível junto', () => {
    expect(regraHighlight('#fde68a')).toBe(
      '::highlight(bm-grifo-fde68a){background-color:#fde68a;color:#0f172a;}',
    );
  });

  it('acompanha a inversão do texto em cor escura', () => {
    expect(regraHighlight('#3b0764')).toContain('color:#ffffff');
  });
});

describe('cursores', () => {
  it('a caneta leva a cor carregada na ponta e declara o fallback', () => {
    const cursor = cursorCaneta('#bfdbfe');
    expect(cursor.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(cursor)).toContain("fill='#bfdbfe'");
    expect(cursor.endsWith(', text')).toBe(true);
  });

  it('o contorno da ponta clareia em cor escura, para não sumir', () => {
    expect(decodeURIComponent(cursorCaneta('#fde68a'))).toContain(
      "fill='#fde68a' stroke='#0f172a'",
    );
    expect(decodeURIComponent(cursorCaneta('#1e1b4b'))).toContain(
      "fill='#1e1b4b' stroke='#f8fafc'",
    );
  });

  it('a borracha tem desenho próprio e fixo', () => {
    const cursor = cursorBorracha();
    expect(cursor.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(cursor.endsWith(', text')).toBe(true);
  });

  it('não deixa caractere cru que quebraria o data URI', () => {
    for (const bruto of [cursorCaneta('#fde68a'), cursorBorracha()]) {
      const dados = bruto.slice('url("data:image/svg+xml,'.length, bruto.indexOf('") '));
      expect(dados).not.toContain('<');
      expect(dados).not.toContain('"');
      expect(dados).not.toContain('#');
    }
  });
});
