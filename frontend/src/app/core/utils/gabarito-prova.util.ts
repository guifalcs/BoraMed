import {
  LETRAS_GABARITO,
  type GabaritoCadernoRef,
  type GabaritoProvaQuestao,
  type LetraGabarito,
} from '../models/gabarito-prova';

interface GabaritoNomeavel {
  titulo: string | null;
  tipo_prova: string;
  periodo: number;
}

/** "N2 · 3º período" quando a equipe não deu título próprio. */
export function nomeGabarito(g: GabaritoNomeavel): string {
  return g.titulo?.trim() || `${g.tipo_prova} · ${g.periodo}º período`;
}

/** Letras válidas para uma prova com `qtd` alternativas (A–D ou A–E). */
export function letrasDisponiveis(qtd: number): LetraGabarito[] {
  return LETRAS_GABARITO.slice(0, Math.max(2, Math.min(5, qtd)));
}

/** Atalhos de nome para o admin cadastrar cadernos com um toque. */
export const NOMES_CADERNO_SUGERIDOS = ['Azul', 'Verde', 'Amarelo', 'Branco', 'Rosa'] as const;

function chaveNome(nome: string): string {
  return nome.trim().toLocaleLowerCase('pt-BR');
}

/** Primeiro "Caderno A", "Caderno B"… que ainda não está em uso (ignora caixa e espaços). */
export function proximoNomeCaderno(existentes: readonly string[]): string {
  const usados = new Set(existentes.map(chaveNome));
  for (const letra of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const nome = `Caderno ${letra}`;
    if (!usados.has(chaveNome(nome))) return nome;
  }
  return `Caderno ${existentes.length + 1}`;
}

/** Nomes que aparecem mais de uma vez (ignora caixa e espaços; vazios não contam). */
export function nomesRepetidos(nomes: readonly string[]): Set<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const nome of nomes) {
    const k = chaveNome(nome);
    if (!k) continue;
    if (vistos.has(k)) repetidos.add(k);
    vistos.add(k);
  }
  return repetidos;
}

/** O caderno que o link pede (`?caderno=<slug>`); null se não existe (nunca "chuta" outro). */
export function acharCaderno<T extends GabaritoCadernoRef>(
  cadernos: readonly T[],
  slug: string | null | undefined,
): T | null {
  if (!slug) return null;
  return cadernos.find((c) => c.slug === slug) ?? null;
}

/** Semestre letivo corrente no formato do banco ("2026.2"). */
export function semestreAtual(hoje: Date = new Date()): string {
  return `${hoje.getFullYear()}.${hoje.getMonth() < 6 ? 1 : 2}`;
}

/** Folha em branco com `total` questões. */
export function folhaEmBranco(total: number): GabaritoProvaQuestao[] {
  return Array.from({ length: total }, (_, i) => ({
    numero: i + 1,
    resposta: null,
    anulada: false,
    area: null,
    comentario: null,
  }));
}

/** Redimensiona a folha preservando o que já foi marcado. */
export function redimensionarFolha(
  folha: GabaritoProvaQuestao[],
  total: number,
): GabaritoProvaQuestao[] {
  if (total <= folha.length) return folha.slice(0, total);
  return [...folha, ...folhaEmBranco(total).slice(folha.length)];
}

/** Teto de questões por gabarito (mesmo limite da RPC de salvar). */
export const MAX_QUESTOES_GABARITO = 200;

type MarcaColada = 'X' | '?' | LetraGabarito;

/**
 * Interpreta um gabarito colado, em qualquer dos formatos que circulam:
 *   "ABCDE…"  ·  "A B C D"  ·  "1-A 2-B 3) C"  ·  "1.A, 2.B"  ·  uma por linha.
 * `X`, `*`, `-` ou "anulada" marcam questão anulada; `?` marca em análise.
 *
 * Com numeração no texto, o NÚMERO manda: cada marca vai para a posição do
 * número que a precede, e palavras soltas ("Gabarito da prova", "1-A e 2-B")
 * são ignoradas. "DA", "DE", "E" são palavras E respostas válidas, então sem
 * esse modo elas deslocariam a folha inteira. Lacunas viram "em análise".
 * Sem numeração, vale a sequência corrida, só com tokens feitos exclusivamente
 * de letras válidas e marcadores.
 */
export function parseSequenciaGabarito(texto: string, qtdAlternativas: number): MarcaColada[] {
  const letras = letrasDisponiveis(qtdAlternativas).join('');
  const upper = texto.toUpperCase().replace(/ANULADA/g, 'X');
  const paraMarca = (c: string): MarcaColada =>
    c === 'X' || c === '*' || c === '-' ? 'X' : c === '?' ? '?' : (c as LetraGabarito);

  if (/\d/.test(upper)) {
    const re = new RegExp(`(\\d+)\\s*[º°ª]?\\s*[-).:–]?\\s*([${letras}X*?\\-])(?![A-Z])`, 'g');
    const porNumero = new Map<number, MarcaColada>();
    for (const m of upper.matchAll(re)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= MAX_QUESTOES_GABARITO) porNumero.set(n, paraMarca(m[2]));
    }
    if (!porNumero.size) return [];
    const max = Math.max(...porNumero.keys());
    return Array.from({ length: max }, (_, i) => porNumero.get(i + 1) ?? '?');
  }

  const tokenValido = new RegExp(`^[${letras}X*?\\-]+$`);
  const saida: MarcaColada[] = [];
  for (const token of upper.split(/[\s,;|/]+/)) {
    if (!token || !tokenValido.test(token)) continue;
    for (const c of token) saida.push(paraMarca(c));
  }
  return saida.slice(0, MAX_QUESTOES_GABARITO);
}

/** Aplica uma sequência interpretada sobre a folha (a partir da questão 1). */
export function aplicarSequencia(
  folha: GabaritoProvaQuestao[],
  sequencia: MarcaColada[],
): GabaritoProvaQuestao[] {
  const total = Math.min(MAX_QUESTOES_GABARITO, Math.max(folha.length, sequencia.length));
  const base = redimensionarFolha(folha, total);
  return base.map((q, i) => {
    const s = sequencia[i];
    if (s === undefined) return q;
    if (s === 'X') return { ...q, resposta: null, anulada: true };
    if (s === '?') return { ...q, resposta: null, anulada: false };
    return { ...q, resposta: s, anulada: false };
  });
}

/** Quantas vezes cada letra é a correta — o "sanity check" do gabarito. */
export function distribuicaoLetras(
  questoes: GabaritoProvaQuestao[],
  qtdAlternativas: number,
): { letra: LetraGabarito; total: number; pct: number }[] {
  const letras = letrasDisponiveis(qtdAlternativas);
  const comLetra = questoes.filter((q) => q.resposta && !q.anulada);
  return letras.map((letra) => {
    const total = comLetra.filter((q) => q.resposta === letra).length;
    return { letra, total, pct: comLetra.length ? Math.round((total / comLetra.length) * 100) : 0 };
  });
}

export interface ResumoFolha {
  total: number;
  preenchidas: number;
  anuladas: number;
  emAnalise: number;
}

export function resumoFolha(questoes: GabaritoProvaQuestao[]): ResumoFolha {
  const anuladas = questoes.filter((q) => q.anulada).length;
  const comLetra = questoes.filter((q) => !q.anulada && q.resposta).length;
  return {
    total: questoes.length,
    preenchidas: comLetra + anuladas,
    anuladas,
    emAnalise: questoes.length - comLetra - anuladas,
  };
}

export type SituacaoConferencia = 'acerto' | 'erro' | 'anulada' | 'em-analise' | 'sem-resposta';

export interface ResultadoConferencia {
  /** Situação de cada questão, indexada pelo número. */
  porQuestao: Record<number, SituacaoConferencia>;
  acertos: number;
  erros: number;
  anuladas: number;
  emAnalise: number;
  semResposta: number;
  /** Questões que contam na nota (com letra fechada pela equipe). */
  consideradas: number;
  /**
   * Nota em 0–100 com anulada contando como acerto para todo mundo (prática
   * usual) e "em análise" fora da conta até a letra ser fechada.
   */
  nota: number;
}

/**
 * Confere as marcações do aluno contra o gabarito. Tudo no cliente: o gabarito
 * já é público, então não há segredo a proteger aqui.
 */
export function conferirRespostas(
  questoes: GabaritoProvaQuestao[],
  marcadas: Record<number, LetraGabarito | undefined>,
): ResultadoConferencia {
  const porQuestao: Record<number, SituacaoConferencia> = {};
  let acertos = 0;
  let erros = 0;
  let anuladas = 0;
  let emAnalise = 0;
  let semResposta = 0;

  for (const q of questoes) {
    const marcada = marcadas[q.numero];
    let s: SituacaoConferencia;
    if (q.anulada) s = 'anulada';
    else if (!q.resposta) s = 'em-analise';
    else if (!marcada) s = 'sem-resposta';
    else s = marcada === q.resposta ? 'acerto' : 'erro';
    porQuestao[q.numero] = s;
    if (s === 'acerto') acertos++;
    else if (s === 'erro') erros++;
    else if (s === 'anulada') anuladas++;
    else if (s === 'em-analise') emAnalise++;
    else semResposta++;
  }

  const consideradas = questoes.length - emAnalise;
  const pontos = acertos + anuladas;
  return {
    porQuestao,
    acertos,
    erros,
    anuladas,
    emAnalise,
    semResposta,
    consideradas,
    nota: consideradas ? Math.round((pontos / consideradas) * 1000) / 10 : 0,
  };
}
