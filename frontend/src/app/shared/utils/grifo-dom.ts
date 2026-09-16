/**
 * Ponte entre o texto do bloco (offsets) e o DOM (Range).
 *
 * O texto renderizado de um bloco pode estar espalhado em vários nós (o
 * Markdown gera `<p>`, `<strong>`, `<em>`…). Estas funções tratam o bloco como
 * uma string única — a concatenação dos nós de texto na ordem do documento —
 * que é o que `Grifo.inicio/fim` endereçam. É a mesma convenção de
 * `Range.toString()` e de `Element.textContent`, então as duas pontas batem.
 */

/** Texto do bloco na mesma convenção usada pelos offsets dos grifos. */
export function textoDoBloco(raiz: Element): string {
  return raiz.textContent ?? '';
}

/**
 * Converte um ponto do DOM (`container` + `offset`) no offset de caractere
 * dentro de `raiz`, ou `null` se o ponto estiver fora dela.
 */
function offsetDoPonto(raiz: Element, container: Node, offset: number): number | null {
  if (!raiz.contains(container)) return null;
  try {
    const medida = document.createRange();
    medida.selectNodeContents(raiz);
    medida.setEnd(container, offset);
    return medida.toString().length;
  } catch {
    return null;
  }
}

export interface TrechoSelecionado {
  readonly inicio: number;
  readonly fim: number;
}

/**
 * Offsets de um `Range` dentro de `raiz`. Uma seleção que atravessa vários
 * blocos (o aluno arrastou do enunciado até a alternativa) é recortada na
 * borda de cada bloco: cada um calcula a sua parte e grifa só o que é seu.
 * Retorna `null` quando o bloco fica de fora da seleção.
 */
export function offsetsDoRange(raiz: Element, range: Range): TrechoSelecionado | null {
  const comeca = raiz.contains(range.startContainer);
  const termina = raiz.contains(range.endContainer);

  if (!comeca && !termina) {
    // O bloco está inteiro no meio da seleção.
    if (!range.intersectsNode(raiz)) return null;
    const total = textoDoBloco(raiz).length;
    return total > 0 ? { inicio: 0, fim: total } : null;
  }

  const inicio = comeca ? offsetDoPonto(raiz, range.startContainer, range.startOffset) : 0;
  const fim = termina
    ? offsetDoPonto(raiz, range.endContainer, range.endOffset)
    : textoDoBloco(raiz).length;

  if (inicio === null || fim === null || fim <= inicio) return null;
  return { inicio, fim };
}

/**
 * Reancora um intervalo de offsets num `Range` do DOM. Retorna `null` se o
 * bloco encolheu (texto trocado, questão diferente) e o intervalo não cabe
 * mais — melhor sumir com o grifo do que pintar o trecho errado.
 */
export function rangeDosOffsets(raiz: Element, inicio: number, fim: number): Range | null {
  if (fim <= inicio) return null;

  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let percorrido = 0;
  let noInicio: Node | null = null;
  let offsetInicio = 0;
  let noFim: Node | null = null;
  let offsetFim = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const len = (node.nodeValue ?? '').length;
    const fimDoNo = percorrido + len;

    if (noInicio === null && inicio < fimDoNo) {
      noInicio = node;
      offsetInicio = inicio - percorrido;
    }
    if (noInicio !== null && fim <= fimDoNo) {
      noFim = node;
      offsetFim = fim - percorrido;
      break;
    }
    percorrido = fimDoNo;
  }

  if (noInicio === null || noFim === null) return null;

  try {
    const range = document.createRange();
    range.setStart(noInicio, offsetInicio);
    range.setEnd(noFim, offsetFim);
    return range;
  } catch {
    return null;
  }
}

/** O navegador sabe pintar highlights sem mexer no DOM? */
export function suportaHighlightApi(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof Highlight === 'function' &&
    !!(CSS as unknown as { highlights?: unknown }).highlights
  );
}
