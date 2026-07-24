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
 * Marcadores de item em numeral romano. Ambos capturam, na ordem:
 * (1) o numeral, (2) o espaço opcional antes do separador, (3) o separador.
 *
 * O separador pode vir colado ao numeral ("I.") ou com espaço antes dele
 * ("I - "), pois as questões usam ambas as convenções — às vezes na mesma
 * enumeração (ex.: "I - ", "II - ", "III-"). Esse espaço é preservado.
 *
 * `MARCADOR_ROMANO_LINHA` exige que o item comece uma linha (início do texto
 * ou logo após uma quebra de linha, tolerando indentação). É o padrão
 * preferencial: reconhece as enumeração já dispostas em linhas — inclusive as
 * "grudadas" com uma única quebra — e, por ancorar no começo da linha, ignora
 * numerais romanos que aparecem no meio de uma frase (ex.: "angiotensina II.",
 * "Hb A2"), que não devem ser tratados como marcadores. Como o item já está no
 * começo da linha, o texto que o segue pode começar com minúscula (algumas
 * questões escrevem "I - aspecto...", "II - a maioria...").
 *
 * `MARCADOR_ROMANO_SOLTO` aceita o numeral após qualquer espaço em branco. É o
 * recurso para enumerações escritas em um único parágrafo corrido, sem
 * nenhuma quebra de linha entre os itens. Aqui o texto do item precisa começar
 * com maiúscula, dígito ou aspas, para não confundir um numeral romano de
 * prosa (ex.: "fases I e II do processo") com um marcador de lista.
 */
const MARCADOR_ROMANO_LINHA =
  /(?:^|\n)[ \t]*([IVX]{1,7})([ \t]*)([.)\-–])[ \t]+(?=["“'«A-Za-zÀ-ÿ0-9])/g;
const MARCADOR_ROMANO_SOLTO =
  /(?:^|\s)([IVX]{1,7})([ \t]*)([.)\-–])\s+(?=["“'«A-ZÀ-Ý0-9])/g;

/**
 * Retorna o maior N tal que os marcadores I..N formem uma enumeração real
 * (I e II presentes, sequência contígua). Retorna 0 quando não há enumeração.
 * Isso evita quebrar numerais romanos soltos em prosa (ex.: "século XX.").
 */
function maxSequenciaRomana(texto: string, marcador: RegExp): number {
  const valores: number[] = [];
  marcador.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = marcador.exec(texto)) !== null) {
    valores.push(romanoParaInt(match[1]));
  }
  if (valores.length < 2) return 0;

  const presentes = new Set(valores);
  if (!presentes.has(1) || !presentes.has(2)) return 0;

  let maxSeq = 0;
  while (presentes.has(maxSeq + 1)) maxSeq++;
  return maxSeq >= 2 ? maxSeq : 0;
}

/** Coloca cada item da enumeração em seu próprio parágrafo. */
function separarItensRomanos(
  texto: string,
  maxSeq: number,
  marcador: RegExp,
): string {
  marcador.lastIndex = 0;
  return texto.replace(
    marcador,
    (completo, numeral: string, espaco: string, separador: string) => {
      const valor = romanoParaInt(numeral);
      if (valor < 1 || valor > maxSeq) return completo;
      return `\n\n${numeral}${espaco}${separador} `;
    },
  );
}

/**
 * Escolhe a estratégia de detecção de enumeração romana: prefere marcadores
 * ancorados no início da linha (mais seguros); só recorre ao modo solto quando
 * aqueles não formam uma sequência — caso de enumerações em parágrafo corrido.
 */
function detectarEnumeracaoRomana(
  texto: string,
): { maxSeq: number; marcador: RegExp } {
  const seqLinha = maxSequenciaRomana(texto, MARCADOR_ROMANO_LINHA);
  if (seqLinha > 0) return { maxSeq: seqLinha, marcador: MARCADOR_ROMANO_LINHA };

  const seqSolto = maxSequenciaRomana(texto, MARCADOR_ROMANO_SOLTO);
  return { maxSeq: seqSolto, marcador: MARCADOR_ROMANO_SOLTO };
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
  // Conector "Porque"/"PORQUE" sozinho em uma linha (asserção/razão escrita com
  // itens romanos I/II em vez de "Asserção 1:"). Preserva o caso original.
  t = t.replace(/(?:^|\n)[ \t]*(Porque|PORQUE)[ \t]*(?=\n|$)/g, '\n\n$1\n\n');
  // Cabeçalho de cada asserção em seu próprio parágrafo.
  t = t.replace(/[ \t]*(Asser[çc][ãa]o\s*\d+\s*:)[ \t]*/g, '\n\n$1 ');
  // Comando final após o bloco de asserções (precedido do fechamento de aspas).
  t = t.replace(/(["”])\s+(A respeito d)/g, '$1\n\n$2');
  return t;
}

/**
 * Isola a frase final interrogativa (a pergunta em si) em seu próprio parágrafo,
 * em enunciados de prosa que terminam com "?". Ex.: um caso clínico seguido da
 * pergunta "... em qual fase do ciclo cardíaco ... e por quê?".
 * Só age quando há ao menos uma frase antes da pergunta, deixando o cenário no
 * primeiro parágrafo e a pergunta destacada abaixo.
 */
function isolarPerguntaFinal(texto: string): string {
  const t = texto.trimEnd();
  if (!t.endsWith('?')) return texto;

  // Início da última frase = logo após o último final de frase (. ! ?)
  // seguido de espaço e letra maiúscula.
  const limites = /[.!?]["'”»)\]]?\s+(?=[A-ZÀ-Ý])/g;
  let inicioUltimaFrase = -1;
  let match: RegExpExecArray | null;
  while ((match = limites.exec(t)) !== null) {
    inicioUltimaFrase = match.index + match[0].length;
  }
  if (inicioUltimaFrase <= 0) return texto;

  const pergunta = t.slice(inicioUltimaFrase);
  if (!pergunta.includes('?')) return texto;

  return `${t.slice(0, inicioUltimaFrase).trimEnd()}\n\n${pergunta}`;
}

export function formatarEnunciado(texto: string | null | undefined): string {
  if (!texto) return '';
  let t = texto.replace(/\r\n/g, '\n');

  const temAssercao = /Asser[çc][ãa]o\s*\d+\s*:/.test(t);
  const { maxSeq, marcador } = detectarEnumeracaoRomana(t);
  const jaTemParagrafos = /\n\s*\n/.test(t);

  t = separarAssercoes(t);
  if (maxSeq > 0) t = separarItensRomanos(t, maxSeq, marcador);
  if (maxSeq > 0 || temAssercao) t = separarComandoFinal(t);
  // Prosa pura (sem itens/asserções e sem parágrafos prévios): destaca a pergunta.
  if (maxSeq === 0 && !temAssercao && !jaTemParagrafos) {
    t = isolarPerguntaFinal(t);
  }

  t = t.replace(/[ \t]+\n/g, '\n'); // remove espaços no fim das linhas
  t = t.replace(/\n{3,}/g, '\n\n'); // no máximo uma linha em branco
  return t.trim();
}
