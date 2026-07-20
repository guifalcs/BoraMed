/**
 * Normaliza o enunciado de uma questão para exibição em Markdown.
 *
 * Muitas questões guardam listas de assertivas ("I. ... II. ... III. ...") e
 * blocos de asserção/razão ("Asserção 1: ... Porque ... Asserção 2: ...") em um
 * único parágrafo corrido. Como o enunciado é renderizado via Markdown — onde uma
 * quebra de linha simples é ignorada — o texto aparece todo grudado.
 *
 * Esta função insere linhas em branco (parágrafos Markdown) antes de cada item,
 * antes do bloco de asserções e antes do comando final ("É correto o que se
 * afirma em:", "Assinale a alternativa correta", …), SEM alterar nenhum conteúdo
 * textual: apenas reorganiza o espaçamento visual.
 */

/** Converte um numeral romano (I, V, X) em inteiro. Suficiente para 1–39. */
function romanoParaInt(romano: string): number {
  const valores: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  for (let i = 0; i < romano.length; i++) {
    const atual = valores[romano[i]] ?? 0;
    const proximo = valores[romano[i + 1]] ?? 0;
    total += atual < proximo ? -atual : atual;
  }
  return total;
}

/**
 * Marcador de item em numeral romano: início de linha ou espaço, seguido do
 * numeral, um separador (ponto, hífen, travessão ou parêntese), espaço e o
 * início do texto do item (letra maiúscula, dígito ou aspas de abertura).
 * O separador original é preservado (ex.: "I." continua "I.", "I-" continua "I-").
 */
const MARCADOR_ROMANO = /(^|\s)([IVX]{1,7})([.)\-–])\s+(?=["“'«A-ZÀ-Ý0-9])/g;

/**
 * Retorna o maior N tal que os marcadores I..N formem uma enumeração real
 * (I e II presentes, sequência contígua). Retorna 0 quando não há enumeração.
 * Isso evita quebrar numerais romanos soltos em prosa (ex.: "século XX.").
 */
function maxSequenciaRomana(texto: string): number {
  const valores: number[] = [];
  MARCADOR_ROMANO.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARCADOR_ROMANO.exec(texto)) !== null) {
    valores.push(romanoParaInt(match[2]));
  }
  if (valores.length < 2) return 0;

  const presentes = new Set(valores);
  if (!presentes.has(1) || !presentes.has(2)) return 0;

  let maxSeq = 0;
  while (presentes.has(maxSeq + 1)) maxSeq++;
  return maxSeq >= 2 ? maxSeq : 0;
}

/** Coloca cada item da enumeração em seu próprio parágrafo. */
function separarItensRomanos(texto: string, maxSeq: number): string {
  MARCADOR_ROMANO.lastIndex = 0;
  return texto.replace(
    MARCADOR_ROMANO,
    (completo, _pre, numeral: string, separador: string) => {
      const valor = romanoParaInt(numeral);
      if (valor < 1 || valor > maxSeq) return completo;
      return `\n\n${numeral}${separador} `;
    },
  );
}

/**
 * Comando final da questão (frase de fechamento que orienta a resposta), que
 * costuma vir grudado no último item. Só é isolado em questões com enumeração
 * ou asserções, para não afetar questões simples.
 */
const COMANDO_FINAL =
  /\s+(?=(?:É\s+(?:[Cc]orreto|[Ii]ncorreto|CORRETO|INCORRETO|verdadeiro|falso)\b|Est[áa]\s+(?:[Cc]orreto|[Ii]ncorreto)\b|Est[ãa]o\s+(?:corret|incorret)[ao]s\b|S[ãa]o\s+(?:corret|incorret)[ao]s\b|Assinale\b|Marque\b))/g;

function separarComandoFinal(texto: string): string {
  return texto.replace(COMANDO_FINAL, '\n\n');
}

/**
 * Separa blocos de asserção/razão em parágrafos:
 *   Asserção 1: "..."
 *
 *   Porque
 *
 *   Asserção 2: "..."
 * e isola o comando final ("A respeito dessas asserções, ...").
 */
function separarAssercoes(texto: string): string {
  let t = texto;
  // Conector "Porque" isolado, quando liga uma asserção à outra.
  t = t.replace(/\s+Porque\s+(?=Asser[çc][ãa]o\s*\d*\s*:)/g, '\n\nPorque\n\n');
  // Cabeçalho de cada asserção em seu próprio parágrafo.
  t = t.replace(/[ \t]*(Asser[çc][ãa]o\s*\d+\s*:)[ \t]*/g, '\n\n$1 ');
  // Comando final após o bloco de asserções (precedido do fechamento de aspas).
  t = t.replace(/(["”])\s+(A respeito d)/g, '$1\n\n$2');
  return t;
}

export function formatarEnunciado(texto: string | null | undefined): string {
  if (!texto) return '';
  let t = texto.replace(/\r\n/g, '\n');

  const temAssercao = /Asser[çc][ãa]o\s*\d+\s*:/.test(t);
  const maxSeq = maxSequenciaRomana(t);

  t = separarAssercoes(t);
  if (maxSeq > 0) t = separarItensRomanos(t, maxSeq);
  if (maxSeq > 0 || temAssercao) t = separarComandoFinal(t);

  t = t.replace(/[ \t]+\n/g, '\n'); // remove espaços no fim das linhas
  t = t.replace(/\n{3,}/g, '\n\n'); // no máximo uma linha em branco
  return t.trim();
}
