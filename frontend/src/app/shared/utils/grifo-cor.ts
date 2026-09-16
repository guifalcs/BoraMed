/**
 * Cor do marca-texto: nome do highlight, contraste do texto e o cursor.
 *
 * Com a paleta aberta ao espectro inteiro, nada disso pode ser tabela fixa — o
 * aluno pode escolher um amarelo claro ou um roxo escuro, e o texto precisa
 * continuar legível nos dois. Tudo aqui é puro: recebe hex, devolve string.
 */

import type { CorGrifo } from './grifo';

/** Nome registrado em `CSS.highlights`; casa com a regra `::highlight()`. */
export function nomeHighlight(cor: CorGrifo): string {
  return `bm-grifo-${cor.slice(1)}`;
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function paraRgb(cor: CorGrifo): Rgb {
  return {
    r: parseInt(cor.slice(1, 3), 16),
    g: parseInt(cor.slice(3, 5), 16),
    b: parseInt(cor.slice(5, 7), 16),
  };
}

/** Luminância relativa (WCAG 2.1). */
function luminancia({ r, g, b }: Rgb): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste (WCAG 2.1) entre duas luminâncias. */
function contraste(l1: number, l2: number): number {
  const [claro, escuro] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
}

const TEXTO_ESCURO = '#0f172a';
const TEXTO_CLARO = '#ffffff';

/**
 * Cor do texto por cima do grifo. Um marca-texto pastel pede texto escuro; um
 * roxo forte, texto branco. Sem esta escolha, escolher uma cor escura no
 * espectro apagaria o próprio enunciado que o aluno quis destacar.
 */
export function corDoTextoSobre(cor: CorGrifo): string {
  const fundo = luminancia(paraRgb(cor));
  const comEscuro = contraste(fundo, luminancia(paraRgb(TEXTO_ESCURO)));
  const comClaro = contraste(fundo, luminancia(paraRgb(TEXTO_CLARO)));
  return comEscuro >= comClaro ? TEXTO_ESCURO : TEXTO_CLARO;
}

function hslParaHex(h: number, sPct: number, lPct: number): CorGrifo {
  const sat = sPct / 100;
  const luz = lPct / 100;
  const c = (1 - Math.abs(2 * luz - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = luz - c / 2;
  const faixa = Math.floor(h / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[faixa]!;
  const canal = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** Matizes da grade, de 36 em 36 graus: uma volta inteira no círculo de cores. */
const MATIZES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
/** Do pastel ao forte. A primeira faixa é a que mais parece marca-texto. */
const LUMINOSIDADES = [86, 74, 62, 48];

/**
 * Grade que cobre o espectro, montada em HSL e entregue em hex.
 *
 * Substitui o seletor de cor do sistema: o popup dele é UI do navegador,
 * ancorada no input, e o estojo mora no canto inferior da tela — lá ele abria
 * cortado, para fora. Esta grade é conteúdo da página, então abre para cima e
 * cabe na tela por construção.
 */
export function gerarEspectroGrifo(): CorGrifo[] {
  const cores: CorGrifo[] = [];
  for (const l of LUMINOSIDADES) {
    for (const h of MATIZES) cores.push(hslParaHex(h, 85, l));
  }
  // Fecha com uma faixa neutra: cinza claro ao escuro serve para marcar sem cor.
  for (const l of [90, 72, 54, 34]) cores.push(hslParaHex(0, 0, l));
  return cores;
}

/** Regra `::highlight()` desta cor, injetada em tempo de execução. */
export function regraHighlight(cor: CorGrifo): string {
  return `::highlight(${nomeHighlight(cor)}){background-color:${cor};color:${corDoTextoSobre(cor)};}`;
}

/**
 * A borda escura do desenho do cursor some em cima de uma cor escura. Acima
 * deste ponto de luminância o contorno segue escuro; abaixo, clareia.
 */
function corDoContorno(cor: CorGrifo): string {
  return luminancia(paraRgb(cor)) > 0.22 ? '#0f172a' : '#f8fafc';
}

/** O SVG vai inteiro codificado: sobra nenhum caractere que feche o `url()`. */
function encodarSvg(svg: string): string {
  return encodeURIComponent(svg);
}

/**
 * Cursor de caneta com a ponta na cor carregada. Desenhado aqui, e não em
 * classe de CSS, porque a cor é livre: uma regra por cor possível não existe.
 * O `text` no fim é o fallback de quem não renderizar SVG em cursor.
 */
export function cursorCaneta(cor: CorGrifo): string {
  const contorno = corDoContorno(cor);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
    `<g transform='rotate(45 14 14)'>` +
    `<rect x='10.25' y='2.5' width='7.5' height='10' rx='2' fill='#ffffff' stroke='#0f172a' stroke-width='1.6'/>` +
    `<rect x='8.75' y='12' width='10.5' height='3' rx='1' fill='#ffffff' stroke='#0f172a' stroke-width='1.6'/>` +
    `<path d='M10.5 15h7l-1.25 6.25h-4.5z' fill='${cor}' stroke='${contorno}' stroke-width='1.6' stroke-linejoin='round'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodarSvg(svg)}") 9 20, text`;
}

/** Cursor da borracha: bloco deitado, silhueta oposta à da caneta. */
export function cursorBorracha(): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
    `<g transform='rotate(-20 14 14)'>` +
    `<rect x='4.5' y='9' width='19' height='10' rx='2.5' fill='#ffffff' stroke='#0f172a' stroke-width='1.6'/>` +
    `<path d='M4.5 14.5h19V16.5a2.5 2.5 0 0 1-2.5 2.5h-14a2.5 2.5 0 0 1-2.5-2.5z' fill='#cbd5e1' stroke='#0f172a' stroke-width='1.6' stroke-linejoin='round'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodarSvg(svg)}") 7 20, text`;
}
