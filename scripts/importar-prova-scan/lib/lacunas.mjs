/**
 * Preenchimento automático dos trechos ilegíveis (`[?]`) marcados na transcrição.
 *
 * O transcritor marca `[?]` onde a foto está ilegível, em vez de chutar. Revisar
 * isso à mão é o gargalo do pipeline — e é evitável na maioria dos casos, porque
 * o mesmo texto existe em outra fonte: o OCR da própria página e, para
 * alternativas, a devolutiva comentada.
 *
 * ## Como funciona
 *
 * Casamento por **palavra**, não por trecho de caracteres. A primeira versão
 * ancorava 26 caracteres exatos de cada lado do buraco e procurava esse padrão
 * na fonte: deu 14% de acerto e os acertos vinham errados (`avaliaç«ão e»
 * especializada`), porque a borda da âncora cai no meio de uma palavra e o OCR
 * tem ruído justamente ali.
 *
 * O que os dados mostram: o `[?]` come um ou dois caracteres *dentro* de uma
 * palavra (`avaliaç[?]`, `[?]sculta`, `funç[?]`). Então:
 *
 *   1. isola a palavra danificada e monta um padrão com o que sobrou visível
 *      (`avaliaç[?]` → `^avaliac.{0,14}$`);
 *   2. usa as palavras vizinhas *inteiras* como âncora — palavra inteira
 *      sobrevive ao ruído de OCR muito melhor que um recorte de 26 chars;
 *   3. só aceita quando os candidatos da fonte convergem para um único conteúdo.
 *
 * Nada é preenchido sem âncora, nem com candidato ambíguo. Todo preenchimento é
 * registrado com a fonte e o candidato, para auditoria.
 */

const MARCA = /\[\?\]|\[ilegível\]|\[ilegivel\]/;
const MARCA_G = new RegExp(MARCA.source, 'g');

/** Sentinela para lacuna já tentada e não resolvida, sem travar o laço. */
const PLACEHOLDER = '';

/** Máximo de caracteres que um `[?]` pode ter escondido. */
const MAX_LACUNA = 14;
/** Palavras vizinhas usadas como âncora, de cada lado. */
const ANCORA_PALAVRAS = 2;

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const soAlnum = (s) => semAcento(s).replace(/[^a-z0-9]/g, '');
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Divide em palavras, guardando o texto original de cada uma. */
function palavras(texto) {
  return [...(texto ?? '').matchAll(/\S+/g)]
    .map((m) => ({ original: m[0], norm: soAlnum(m[0]) }))
    .filter((p) => p.norm.length > 0);
}

/** Isola a palavra danificada e as palavras-âncora ao redor. */
function recortarContexto(texto, posMarca, tamMarca) {
  const antes = texto.slice(0, posMarca);
  const depois = texto.slice(posMarca + tamMarca);

  const inicioPalavra = Math.max(antes.lastIndexOf(' '), antes.lastIndexOf('\n')) + 1;
  const fimRel = depois.search(/\s/);
  const fimPalavra = fimRel === -1 ? depois.length : fimRel;

  return {
    prefixo: soAlnum(antes.slice(inicioPalavra)),
    sufixo: soAlnum(depois.slice(0, fimPalavra)),
    esquerda: palavras(antes.slice(0, inicioPalavra)).slice(-ANCORA_PALAVRAS).map((p) => p.norm),
    direita: palavras(depois.slice(fimPalavra)).slice(0, ANCORA_PALAVRAS).map((p) => p.norm),
  };
}

/**
 * Procura na fonte a palavra que encaixa no padrão, ancorada pelas vizinhas.
 * @returns {{trecho: string, candidato: string, ancoras: number} | null}
 */
function buscarNaFonte(ctx, fonte) {
  const { prefixo, sufixo, esquerda, direita } = ctx;
  const alvo = palavras(fonte);
  if (alvo.length === 0) return null;

  // Sem âncora nenhuma o casamento é chute. E quando sobra pouco visível da
  // palavra danificada, uma âncora só não basta.
  const visivel = prefixo.length + sufixo.length;
  const ladosComAncora = (esquerda.length > 0 ? 1 : 0) + (direita.length > 0 ? 1 : 0);
  if (ladosComAncora === 0) return null;
  if (visivel < 3 && ladosComAncora < 2) return null;

  // Marca isolada entre espaços (`atividade [?] física`) é palavra inteira
  // faltando: não sobra nenhum caractere para restringir o padrão, e o
  // casamento acaba capturando a própria palavra-âncora — foi o que produziu
  // "atividade física física". Sem prefixo nem sufixo, não há o que deduzir.
  if (visivel === 0) return null;

  const re = new RegExp(`^${escapar(prefixo)}.{0,${MAX_LACUNA}}${escapar(sufixo)}$`);

  const candidatos = [];
  for (let i = 0; i < alvo.length; i += 1) {
    if (!re.test(alvo[i].norm)) continue;

    let okEsq = esquerda.length > 0;
    for (let k = 0; k < esquerda.length; k += 1) {
      const idx = i - esquerda.length + k;
      if (idx < 0 || alvo[idx].norm !== esquerda[k]) { okEsq = false; break; }
    }
    let okDir = direita.length > 0;
    for (let k = 0; k < direita.length; k += 1) {
      const idx = i + 1 + k;
      if (idx >= alvo.length || alvo[idx].norm !== direita[k]) { okDir = false; break; }
    }

    // Uma âncora íntegra basta — o OCR pode ter estragado a vizinha do outro
    // lado — mas casar dos dois lados vale mais na hora de escolher.
    if (!okEsq && !okDir) continue;

    candidatos.push({
      palavra: alvo[i],
      peso: (okEsq ? esquerda.length : 0) + (okDir ? direita.length : 0),
    });
  }

  if (candidatos.length === 0) return null;

  const melhor = Math.max(...candidatos.map((c) => c.peso));
  const finalistas = candidatos.filter((c) => c.peso === melhor);
  if (new Set(finalistas.map((c) => c.palavra.norm)).size > 1) return null;

  // Extrai só o conteúdo do buraco, preservando acento e caixa. A pontuação de
  // borda do candidato é descartada para "ambientais," não virar fill com vírgula.
  const limpo = finalistas[0].palavra.original.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!re.test(soAlnum(limpo))) return null;

  const trecho = limpo.slice(prefixo.length, limpo.length - sufixo.length);
  if (!trecho || trecho.length > MAX_LACUNA || MARCA.test(trecho)) return null;

  return { trecho, candidato: limpo, ancoras: melhor };
}

/**
 * Preenche as lacunas de um campo a partir das fontes, em ordem de preferência.
 *
 * @param {string} texto campo transcrito, possivelmente com `[?]`
 * @param {Array<{nome: string, texto: string}>} fontes candidatas
 * @returns {{texto: string, preenchimentos: Array, pendentes: number}}
 */
export function preencherLacunas(texto, fontes) {
  if (!texto || !MARCA.test(texto)) {
    return { texto, preenchimentos: [], pendentes: 0 };
  }

  const preenchimentos = [];
  let pendentes = 0;
  let saida = texto;

  for (let guarda = 0; guarda < 12; guarda += 1) {
    MARCA_G.lastIndex = 0;
    const m = MARCA_G.exec(saida);
    if (!m) break;

    const ctx = recortarContexto(saida, m.index, m[0].length);
    const antes = saida.slice(0, m.index);
    const depois = saida.slice(m.index + m[0].length);

    let resolvido = null;
    for (const fonte of fontes) {
      if (!fonte.texto) continue;
      const achado = buscarNaFonte(ctx, fonte.texto);
      if (!achado) continue;
      resolvido = { ...achado, fonte: fonte.nome };
      break;
    }

    if (!resolvido) {
      pendentes += 1;
      saida = `${antes}${PLACEHOLDER}${depois}`;
      continue;
    }

    preenchimentos.push({
      fonte: resolvido.fonte,
      candidato: resolvido.candidato,
      trecho: resolvido.trecho,
      contexto: `…${antes.slice(-24)}«${resolvido.trecho}»${depois.slice(0, 24)}…`,
    });
    saida = `${antes}${resolvido.trecho}${depois}`;
  }

  return { texto: saida.replaceAll(PLACEHOLDER, '[?]'), preenchimentos, pendentes };
}

/** Conta as marcas de ilegível em um texto. */
export function contarLacunas(texto) {
  return ((texto ?? '').match(MARCA_G) ?? []).length;
}

/**
 * Confere que uma resolução automática mexeu SÓ nas lacunas.
 *
 * Trava necessária: na TPI 2025.1 um agente devolveu a Q13 truncada — cortou
 * "Considerando o quadro clínico do" do início do enunciado, muito além do
 * `[?]`. Nenhuma regra de prompt garante isso; o texto fora das marcas tem que
 * ser conferido mecanicamente.
 *
 * A comparação é frouxa (sem acento, sem caixa, sem pontuação) porque o
 * preenchimento pode encostar nos trechos vizinhos.
 *
 * @returns {{ok: true} | {ok: false, motivo: string}}
 */
export function validarResolucao(original, resolvido) {
  if (typeof resolvido !== 'string' || !resolvido.trim()) {
    return { ok: false, motivo: 'texto resolvido vazio' };
  }
  if (MARCA.test(resolvido)) {
    return { ok: false, motivo: 'ainda contém marca de ilegível' };
  }

  const chave = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '');
  const alvo = chave(resolvido);

  // Cada pedaço entre marcas do original tem que reaparecer, na ordem.
  const pedacos = original.split(MARCA_G).map(chave).filter((p) => p.length >= 4);
  let cursor = 0;
  for (const pedaco of pedacos) {
    const i = alvo.indexOf(pedaco, cursor);
    if (i < 0) {
      return {
        ok: false,
        motivo: `trecho original ausente ou reordenado ("…${pedaco.slice(0, 40)}…")`,
      };
    }
    cursor = i + pedaco.length;
  }

  // Crescimento desproporcional indica texto inventado além da lacuna.
  const lacunas = contarLacunas(original);
  const cresceu = alvo.length - pedacos.reduce((a, p) => a + p.length, 0);
  if (cresceu > lacunas * MAX_LACUNA + 8) {
    return { ok: false, motivo: `cresceu ${cresceu} caracteres para ${lacunas} lacuna(s)` };
  }

  return { ok: true };
}
