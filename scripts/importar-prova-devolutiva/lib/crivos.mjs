/**
 * Os crivos de validação do relatório de devolutiva.
 *
 * O risco aqui é diferente do TPI. Lá a dúvida era "a IA leu o scan certo?"; a
 * extração já é fiel por construção, então o que sobra é:
 *
 *  - o **autômato de rótulos** ter cortado no lugar errado e perdido texto;
 *  - a **camada de texto do próprio PDF** estar corrompida em algum trecho;
 *  - a marcação `(CORRETA)` **discordar** do que a resposta comentada explica;
 *  - o texto ter linha que o parser do `/admin/importar` leria como rótulo.
 *
 * O crivo 2 é o de verdade: `(CORRETA)` vem do metadado da questão e a resposta
 * comentada vem da prosa de quem escreveu — duas fontes independentes dentro do
 * mesmo PDF. Onde as duas concordam, o gabarito está conferido de fato.
 */

import { similaridade, similaridadeVocabulario, colapsar, normalizar } from './texto.mjs';

export const LETRAS = ['a', 'b', 'c', 'd', 'e'];

/**
 * Rótulos que `parseQuestaoBloco()` do admin lê no início de uma linha.
 * Idêntico ao do pipeline do TPI — mesmo parser do outro lado.
 */
export const RESERVADO = new RegExp(
  '^\\s*(?:' +
    '---\\s*$' +
    '|(?:ENUNCIADO|ENUNCIADO_APOIO|ALTERNATIVAS|RESPOSTA_MODELO|PONTOS_CHAVE)\\s*$' +
    '|(?:FORMATO|CRITERIOS|GABARITO|TIPO|DISCIPLINA|TEMAS?|REFERENCIA|FONTE|EXPLICACAO)\\s*:' +
  ')',
  'i',
);

// ─────────────────────────── crivo 1: estrutura ───────────────────────────

export function crivoEstrutura(q) {
  const flags = [];
  const presentes = LETRAS.filter((l) => (q.alternativas[l] ?? '').trim());

  if (!q.enunciado.trim()) {
    flags.push({ codigo: 'enunciado_vazio', severidade: 'alta', detalhe: 'enunciado sem texto' });
  }

  // Formato indefinido: o campo `Alternativas:` tinha texto e nenhuma linha
  // virou alternativa. Nunca é questão discursiva — é o autômato de rótulos
  // tendo comido o campo. Bloqueia antes de qualquer outra conclusão.
  if (q.formato === 'indefinido') {
    flags.push({
      codigo: 'formato_indefinido',
      severidade: 'alta',
      detalhe: 'o campo "Alternativas:" tem conteúdo, mas nenhuma "(alternativa X)" foi reconhecida',
    });
    return flags;
  }

  if (q.formato === 'aberta') return [...flags, ...crivoDiscursiva(q)];

  if (presentes.length < 4) {
    flags.push({
      codigo: 'poucas_alternativas',
      severidade: 'alta',
      detalhe: `${presentes.length} alternativas (${presentes.join('') || '—'}); o relatório usa 4 (a–d)`,
    });
  }
  // Buraco na sequência: alternativas b,c,d sem a significa marcador perdido.
  const esperado = LETRAS.slice(0, presentes.length);
  if (presentes.join('') !== esperado.join('')) {
    flags.push({
      codigo: 'alternativas_nao_contiguas',
      severidade: 'alta',
      detalhe: `letras ${presentes.join('')}, esperado ${esperado.join('')}`,
    });
  }
  if (!q.letra_correta) {
    flags.push({
      codigo: 'sem_correta_unica',
      severidade: 'alta',
      detalhe: q.corretas_marcadas.length === 0
        ? 'nenhuma alternativa marcada (CORRETA)'
        : `${q.corretas_marcadas.length} alternativas marcadas (CORRETA): ${q.corretas_marcadas.join(', ')}`,
    });
  } else if (!(q.alternativas[q.letra_correta] ?? '').trim()) {
    flags.push({
      codigo: 'correta_sem_texto',
      severidade: 'alta',
      detalhe: `(CORRETA) aponta para ${q.letra_correta.toUpperCase()}, que está vazia`,
    });
  }

  // Alternativas idênticas: sempre erro de extração, nunca questão real.
  const vistos = new Map();
  for (const l of presentes) {
    const chave = normalizar(q.alternativas[l]);
    if (vistos.has(chave)) {
      flags.push({
        codigo: 'alternativas_duplicadas',
        severidade: 'alta',
        detalhe: `${vistos.get(chave).toUpperCase()} e ${l.toUpperCase()} têm o mesmo texto`,
      });
    }
    vistos.set(chave, l);
  }

  // Alternativa curta demais para ser resposta. O limiar é baixo de propósito:
  // resposta de uma palavra é normal em prova médica ("Fimose.", "Sífilis.",
  // "Baby blues."), e flagá-las gerava 8 avisos inúteis por prova. Já com 4
  // caracteres ou menos não sobra resposta possível — na questão 21 da
  // Integradora 2024.2 a alternativa C do PDF é literalmente "x", erro de
  // digitação da questão original. Isso é bloqueio: "x" não pode entrar no
  // acervo como alternativa.
  //
  // "I, apenas." é alternativa legítima de questão de assertivas, e por isso
  // esse tipo de questão fica fora da regra.
  if (!ehQuestaoDeAssertivas(q)) {
    for (const l of presentes) {
      const texto = colapsar(q.alternativas[l]);
      if (texto.length <= 4) {
        flags.push({
          codigo: 'alternativa_degenerada',
          severidade: 'alta',
          detalhe: `${l.toUpperCase()} tem só "${texto}" — a resposta comentada costuma dizer qual era`,
        });
      }
    }
  }

  return flags;
}

// ────────────── crivo 1b: questão discursiva ──────────────

/** Subitens de comando do enunciado: `a) Caracterize…`, `b) Explique…`. */
function itensDoEnunciado(texto) {
  return [
    ...String(texto ?? '').matchAll(/(?:^|\n)\s*([a-e])\s*\)\s*\S/gi),
  ].map((m) => m[1].toLowerCase());
}

/**
 * O que uma discursiva precisa para entrar no acervo.
 *
 * Não há `(CORRETA)` para cruzar aqui, então o crivo 2 é inaplicável e o peso
 * cai todo neste: a `RESPOSTA_MODELO` é obrigatória no `/admin/importar`, é o
 * que o aluno vê como gabarito e é o que a Aurora usa para corrigir. Questão
 * discursiva sem ela não é questão pela metade — é questão sem gabarito.
 *
 * A cobertura dos subitens é o cruzamento possível: quando o enunciado pergunta
 * `a)`, `b)` e `c)`, a chave de resposta costuma responder item a item, e um
 * item sem eco quase sempre significa que a resposta comentada foi cortada na
 * extração. É `media` e não `alta` porque a chave às vezes responde em prosa
 * corrida, sem repetir as letras.
 */
export function crivoDiscursiva(q) {
  const flags = [];
  const modelo = q.resposta_modelo ?? '';

  if (!modelo.trim()) {
    flags.push({
      codigo: 'sem_resposta_modelo',
      severidade: 'alta',
      detalhe: 'questão discursiva sem resposta comentada — não há gabarito para importar',
    });
    return flags;
  }

  if (colapsar(modelo).length < 120) {
    flags.push({
      codigo: 'resposta_modelo_curta',
      severidade: 'media',
      detalhe: `resposta comentada com ${colapsar(modelo).length} caracteres — confira se não foi cortada`,
    });
  }

  const itens = itensDoEnunciado(q.enunciado);
  if (itens.length >= 2) {
    const respondidos = new Set(itensDoEnunciado(modelo));
    const semEco = itens.filter((i) => !respondidos.has(i));
    if (semEco.length > 0 && respondidos.size > 0) {
      flags.push({
        codigo: 'item_sem_resposta',
        severidade: 'media',
        detalhe: `o enunciado pede ${itens.join(', ')} e a chave responde ${[...respondidos].join(', ')}`,
      });
    }
  }

  if (Object.keys(q.alternativas ?? {}).length > 0) {
    flags.push({
      codigo: 'aberta_com_alternativas',
      severidade: 'alta',
      detalhe: 'questão classificada como discursiva mas com alternativas parseadas',
    });
  }

  return flags;
}

// ────────────── questões de assertivas ──────────────

const ROMANOS = ['I', 'II', 'III', 'IV', 'V'];

/**
 * Conjunto de numerais romanos citados numa alternativa do tipo "II e IV,
 * apenas". A ordem decrescente de comprimento evita que `IV` seja lido como
 * `I` seguido de lixo.
 */
function romanosCitados(texto) {
  const t = ` ${colapsar(texto).toUpperCase()} `;
  return ROMANOS.filter((r) => new RegExp(`(?:^|[^A-Z])${r}(?![A-Z])`).test(t));
}

/**
 * Uma questão é "de assertivas" quando **todas** as alternativas são só
 * combinações de numerais romanos: "I, apenas.", "I e II.", "III e IV.".
 *
 * Essas alternativas não têm token com poder discriminativo nenhum, então o
 * cruzamento por texto é inaplicável por construção — no TPI isso virava
 * `cruzamento_inaplicavel` e a questão ficava sem conferência de gabarito.
 * Aqui dá para fazer melhor: ver `cruzamentoDeAssertivas`.
 */
export function ehQuestaoDeAssertivas(q) {
  const presentes = LETRAS.filter((l) => (q.alternativas[l] ?? '').trim());
  if (presentes.length < 2) return false;
  // "Todas as afirmativas estão corretas." e "Nenhuma está correta." são opções
  // legítimas desse tipo de questão e não citam numeral nenhum, então a exigência
  // de numeral é do conjunto (pelo menos duas), não de cada alternativa.
  if (presentes.filter((l) => romanosCitados(q.alternativas[l]).length > 0).length < 2) return false;

  return presentes.every((l) => {
    const t = colapsar(q.alternativas[l]);
    if (t.length > 60) return false;
    // Sobra só numeral, conectivo, pontuação e o boilerplate de enunciado de
    // assertiva — nada de conteúdo clínico. "Apenas as afirmativas I, II e IV
    // estão corretas." conta; "Deposição mesangial de IgA" não.
    const resto = t.replace(
      /[IViv]+|apenas|somente|todas|nenhuma|est[ãa]o|est[áa]|s[ãa]o|[ée]|corret[oa]s?|incorret[oa]s?|verdadeir[oa]s?|fals[oa]s?|afirmativas?|assertivas?|itens|item|proposi[çc][õo]es|alternativas?|as|os|a|o|e|,|\.|;|:|\s/gi,
      '',
    );
    return resto.length === 0;
  });
}

/**
 * Cruzamento para questão de assertivas: a resposta comentada julga cada
 * numeral, e a alternativa marcada tem que ser exatamente o conjunto dos
 * julgados corretos.
 *
 * Formatos vistos nesta prova, os dois cobertos:
 *
 *     Assertiva I: Correta. O Sinal de Murphy é pesquisado…        (veredito na mesma linha)
 *     Afirmativa I: Trata-se de um quadro de anafilaxia…
 *     Essa afirmativa está correta, pois…                         (veredito no parágrafo seguinte)
 *
 * É o crivo mais forte do pipeline: compara um conjunto contra outro, sem
 * depender de similaridade de texto nenhuma.
 */
export function cruzamentoDeAssertivas(q) {
  const comentario = q.explicacao ?? '';
  const marcadores = [
    ...comentario.matchAll(/\b(?:afirmativa|assertiva|item|proposi[çc][ãa]o)\s*([IV]{1,3})\b/gi),
  ];
  if (marcadores.length === 0) return null;

  const julgados = {};
  marcadores.forEach((m, i) => {
    const romano = m[1].toUpperCase();
    if (!ROMANOS.includes(romano)) return;
    const fim = i + 1 < marcadores.length ? marcadores[i + 1].index : comentario.length;
    const trecho = comentario.slice(m.index, fim);
    const v = vereditoDoTrecho(trecho);
    // Primeira menção ganha: o comentário às vezes retoma a assertiva depois.
    if (v && julgados[romano] === undefined) julgados[romano] = v;
  });

  const corretos = ROMANOS.filter((r) => julgados[r] === 'correta');
  const avaliados = ROMANOS.filter((r) => julgados[r] !== undefined);
  if (avaliados.length === 0) return null;

  const presentes = LETRAS.filter((l) => (q.alternativas[l] ?? '').trim());
  const chave = (lista) => lista.join(',');
  const casam = presentes.filter((l) => chave(romanosCitados(q.alternativas[l])) === chave(corretos));

  return {
    julgados,
    corretos,
    avaliados,
    // Só decide quando exatamente uma alternativa reproduz o conjunto.
    letra_esperada: casam.length === 1 ? casam[0] : null,
    ambigua: casam.length > 1,
  };
}

// ────────────── crivo 2: (CORRETA) × resposta comentada ──────────────

/**
 * Veredito em qualquer posição do trecho. "Incorreta" contém "correta", então a
 * ordem dos testes é o que decide.
 *
 * Usado só onde o trecho já está delimitado a **uma** alternativa ou assertiva
 * (o caminho das questões de assertivas). Para o caminho geral, ver
 * `RE_VEREDITO_INICIAL`: lá o trecho é um parágrafo solto e ler veredito de
 * qualquer posição gera acusação falsa.
 */
function vereditoDoTrecho(trecho) {
  if (/\bin\s?corret[oa]s?\b|\berrad[oa]s?\b|\bfals[oa]s?\b|\berro\b/i.test(trecho)) return 'incorreta';
  if (/\bcorret[oa]s?\b|\bverdadeir[oa]s?\b/i.test(trecho)) return 'correta';
  return null;
}

/**
 * Veredito **na posição em que veredito aparece**: no começo do parágrafo, depois
 * de um rótulo opcional ("Alternativa correta:", "Assertiva I: Correta.",
 * "Erro: …", "Correta - …").
 *
 * Ancorar é o que separa julgamento de prosa. Sem isso, o parágrafo
 *
 *     "Erro: Embora Giardia lamblia e o quadro clínico estejam corretos,
 *      o Albendazol é um anti-helmíntico…"
 *
 * era lido como "correta" pelo "corretos" da oração concessiva, e acusava o
 * gabarito da questão 28 da 2025.2 de estar errado — quando o parágrafo diz
 * exatamente o contrário, e o "Erro:" inicial é o veredito.
 */
const RE_VEREDITO_INICIAL = new RegExp(
  '^\\s*' +
  // Rótulo opcional antes do veredito. Os dois relatórios usam vocabulários
  // diferentes para a mesma coisa — a 2025.2 escreve "Alternativa correta:", a
  // 2025.1 escreve "Comentário: Correta." e "Classificação: incorreta." —, então
  // a lista cobre as duas.
  '(?:(?:a\\s+)?(?:alternativa|assertiva|afirmativa|op[çc][ãa]o|item|proposi[çc][ãa]o' +
    '|coment[áa]rio|classifica[çc][ãa]o|justificativa|an[áa]lise|veredito|resposta|gabarito)s?' +
    '\\s*(?:[IVX]{1,3}|[A-E])?\\s*[:\\-–—]?\\s*)?' +
  '(in\\s?corret[oa]s?|corret[oa]s?|errad[oa]s?|erro|fals[oa]s?|verdadeir[oa]s?)\\b',
  'i',
);

/** Aspas de abertura de citação da alternativa, quando o veredito vem depois. */
const RE_CITACAO_INICIAL = /^\s*["“][^"”]{20,}["”]\s*/;

/**
 * Cabeçalho que abre uma seção do comentário e vale para os parágrafos seguintes.
 *
 * É o formato mais comum das duas provas — o comentário separa a correta das
 * demais em blocos, sem repetir o veredito em cada parágrafo:
 *
 *     Resposta correta:
 *     Orientar aleitamento materno exclusivo até 6 meses…
 *     Por que as demais estão incorretas:
 *     Orientar aleitamento apenas até 4 meses com água e sucos…
 *
 * Exige forma de cabeçalho (curto e terminando em `:`/`?`, ou abrindo com palavra
 * de seção) para não confundir com a citação de uma alternativa que por acaso
 * contenha "correta" no próprio texto.
 */
const RE_FORMA_DE_CABECALHO =
  /^(?:justificativa|an[áa]lise|resposta|respostas|por\s+qu[êe]|porqu[êe]|gabarito|coment[áa]rio|distratores|alternativas?|demais|as\s+demais|op[çc][õo]es)\b/i;

function cabecalhoDeSecao(paragrafo) {
  const t = colapsar(paragrafo);
  if (!t || t.length > 90) return null;
  const pareceCabecalho = /[:?]\s*$/.test(t) || RE_FORMA_DE_CABECALHO.test(t);
  if (!pareceCabecalho) return null;
  if (/\b(?:in\s?corret[oa]s?|errad[oa]s?|demais|distratores)\b/i.test(t)) return 'incorreta';
  if (/\bcorret[oa]s?\b/i.test(t)) return 'correta';
  return null;
}

/** Veredito herdado da seção, por parágrafo. `null` fora de qualquer seção. */
function secoesDoComentario(paragrafos) {
  let atual = null;
  return paragrafos.map((p) => {
    const cabecalho = cabecalhoDeSecao(p);
    if (cabecalho) {
      atual = cabecalho;
      return null; // o cabeçalho em si não é alternativa nenhuma
    }
    return atual;
  });
}

function vereditoNoInicio(trecho) {
  const t = String(trecho ?? '').replace(RE_CITACAO_INICIAL, '');
  const m = t.match(RE_VEREDITO_INICIAL);
  if (!m) return null;
  return /^in|^errad|^erro|^fals/i.test(m[1]) ? 'incorreta' : 'correta';
}

/**
 * Veredito abrindo uma frase no meio do parágrafo: `… APS. Incorreta: Ao
 * solicitar exames …`.
 *
 * A unidade de análise do crivo é o parágrafo, e isso pressupõe que o relatório
 * separe com linha em branco o julgamento de cada alternativa. A IESC 2025.2
 * não separa: os quatro vereditos vêm num bloco corrido, e o comentário inteiro
 * virava **um** parágrafo. O ranking então só tinha um candidato, o veredito
 * lido era o do começo do bloco (`Incorreto:`, que julga a alternativa D), e a
 * questão 1 saía acusada de ter o gabarito errado — quando o `Correto:` do
 * segundo julgamento nomeia exatamente a alternativa marcada.
 *
 * O corte é conservador: só quebra onde há **fronteira de frase** seguida de
 * veredito com dois-pontos, que é forma de julgamento e não de prosa.
 */
const RE_CORTE_DE_VEREDITO =
  /(?<=[.!?])\s+(?=(?:in)?corret[oa]s?\s*:|alternativa\s+(?:in)?corret[oa]s?\s*:)/gi;

/**
 * Parágrafos do comentário, subdividindo os que empacotam vários julgamentos.
 *
 * O corte só vale para o formato em que **o veredito abre o julgamento**
 * (`Incorreto: <justificativa>. Correto: <justificativa>.`), e a condição para
 * reconhecê-lo é o comentário começar com um veredito.
 *
 * O outro formato — `<citação da alternativa>. Incorreta: <justificativa>.`,
 * da IESC 2025.1 — parece o mesmo e se comporta ao contrário: cortar antes de
 * cada veredito ali junta a justificativa de uma alternativa com a citação da
 * **seguinte**, e cada alternativa passa a casar com o parágrafo que carrega o
 * veredito da anterior. Um deslocamento de um, que acusou o gabarito correto da
 * questão 4 de estar errado. Sem o corte, esse formato continua caindo em
 * `sem_eco`/`presenca` — sem confirmação, que é diferente de acusação.
 */
function segmentarComentario(comentario) {
  const paragrafos = comentario.split(/\n{2,}/).filter((p) => p.trim());
  if (!vereditoNoInicio(comentario)) return paragrafos;
  return paragrafos.flatMap((p) => p.split(RE_CORTE_DE_VEREDITO)).filter((p) => p.trim());
}

/** Margem mínima sobre o segundo parágrafo mais parecido para o par decidir. */
const MARGEM_MINIMA = 0.15;
/** Similaridade mínima para considerar que o comentário descreve a alternativa. */
const ECO_MINIMO = 0.45;

/**
 * O parágrafo é só a alternativa citada, sem julgamento nenhum?
 *
 * Importa porque o veredito não pode ser lido do texto da própria alternativa. Na
 * questão 17 da Integradora 2025.1 a alternativa é *"A assertiva I é verdadeira e
 * a II é falsa."* e o comentário abre citando-a inteira: ler "falsa" ali como
 * veredito acusava o gabarito de errado num caso em que ele está certo.
 */
function ehApenasCitacao(paragrafo, alternativa) {
  const p = normalizar(paragrafo);
  const a = normalizar(alternativa);
  if (!a || !p) return false;
  return p.length <= a.length * 1.25 && similaridade(alternativa, paragrafo) >= 0.9;
}

/**
 * Lê o veredito que o comentário dá a uma alternativa.
 *
 * O relatório usa quatro formatos, e a ordem abaixo é a que os cobre sem inventar:
 *
 *   Correta - O desenvolvimento global está adequado…      veredito abre o parágrafo
 *   "Os corticosteroides…" Incorreta. Eles atuam…          veredito fecha o parágrafo
 *   Alternativa correta:                                   rótulo curto no parágrafo anterior
 *   Mutação no gene APC… - O paciente apresenta…
 *   A assertiva I é verdadeira e a II é falsa.             citação pura; veredito no seguinte
 *   Essa afirmativa está correta, pois…
 *
 * A ordem importa e não é intercambiável. O veredito do próprio parágrafo vem
 * primeiro porque é inequívoco. O parágrafo **seguinte** só é consultado quando o
 * parágrafo é citação pura — nesse formato o veredito vem depois do texto citado.
 * O rótulo **anterior** vem por último: quando o parágrafo já é citação, o
 * anterior costuma ser o julgamento de *outra* alternativa.
 */
function vereditoDaAlternativa(paragrafos, secoes, indice, alternativa) {
  const atual = paragrafos[indice] ?? '';

  const proprio = vereditoNoInicio(atual);
  if (proprio) return { veredito: proprio, origem: 'mesmo_paragrafo' };

  if (ehApenasCitacao(atual, alternativa)) {
    const seguinte = vereditoNoInicio(paragrafos[indice + 1] ?? '');
    if (seguinte) return { veredito: seguinte, origem: 'paragrafo_seguinte' };
  }

  // Rótulo curto imediatamente antes ("Alternativa correta:").
  const anterior = colapsar(paragrafos[indice - 1] ?? '');
  if (anterior && anterior.length <= 80) {
    const v = vereditoNoInicio(anterior);
    if (v) return { veredito: v, origem: 'rotulo_anterior' };
  }

  // Seção em que o parágrafo está ("Por que as demais estão incorretas:").
  if (secoes[indice]) return { veredito: secoes[indice], origem: 'secao' };

  return { veredito: null, origem: null };
}

/**
 * Confere a marcação `(CORRETA)` contra a resposta comentada.
 *
 * Para cada alternativa, procura o parágrafo do comentário que a descreve
 * (bigramas — ver `lib/texto.mjs` do TPI para o porquê) e lê o veredito que
 * aquele parágrafo dá. O resultado esperado é: exatamente a alternativa marcada
 * julgada correta, e as outras julgadas incorretas.
 *
 * `cobertura` diz quanta força o crivo teve nesta questão, e o relatório mostra
 * a distribuição. "sem_eco" não é acusação de erro — é ausência de confirmação,
 * e a diferença entre as duas coisas é o que impede o relatório de mentir.
 */
export function crivoCruzamento(q) {
  const flags = [];
  const comentario = q.explicacao ?? '';
  const presentes = LETRAS.filter((l) => (q.alternativas[l] ?? '').trim());
  const marcada = q.letra_correta;

  // Discursiva não tem gabarito de letra para cruzar: a conferência dela é o
  // `crivoDiscursiva`. Dizer `sem_eco` aqui misturaria "não deu para conferir"
  // com "não há o que conferir".
  if (q.formato === 'aberta' || q.formato === 'indefinido') {
    return { flags: [], cobertura: 'nao_se_aplica', vereditos: {}, assertivas: null };
  }

  if (!comentario.trim()) {
    return {
      flags: [{ codigo: 'sem_resposta_comentada', severidade: 'media', detalhe: 'questão entra sem EXPLICACAO' }],
      cobertura: 'ausente',
      vereditos: {},
      assertivas: null,
    };
  }

  // Questão de assertivas tem caminho próprio: comparar conjuntos de numerais é
  // mais forte que similaridade de texto, e a similaridade é inaplicável aqui de
  // qualquer forma ("I e II." não tem token nenhum).
  if (ehQuestaoDeAssertivas(q)) {
    const a = cruzamentoDeAssertivas(q);
    if (!a || !a.letra_esperada) {
      return {
        flags: [{
          codigo: 'assertivas_sem_veredito',
          severidade: 'baixa',
          detalhe: a
            ? `comentário julga ${a.avaliados.join(', ') || 'nenhuma'} assertiva(s); ` +
              `corretas: ${a.corretos.join(', ') || 'nenhuma'}` +
              (a.ambigua ? ' — mais de uma alternativa reproduz esse conjunto' : '')
            : 'comentário não julga as assertivas uma a uma',
        }],
        cobertura: 'inaplicavel',
        vereditos: {},
        assertivas: a,
      };
    }
    if (a.letra_esperada !== marcada) {
      return {
        flags: [{
          codigo: 'gabarito_contradiz_assertivas',
          severidade: 'alta',
          detalhe:
            `(CORRETA) marca ${(marcada ?? '—').toUpperCase()}, mas o comentário julga corretas as ` +
            `assertivas ${a.corretos.join(', ') || 'nenhuma'}, que correspondem à ` +
            `alternativa ${a.letra_esperada.toUpperCase()} ("${colapsar(q.alternativas[a.letra_esperada])}")`,
        }],
        cobertura: 'forte',
        vereditos: {},
        assertivas: a,
      };
    }
    return { flags: [], cobertura: 'forte', vereditos: {}, assertivas: a };
  }

  const paragrafos = segmentarComentario(comentario);
  const secoes = secoesDoComentario(paragrafos);
  const vereditos = {};

  for (const l of presentes) {
    const texto = q.alternativas[l];
    const ranking = paragrafos
      .map((p, i) => ({ indice: i, escore: similaridade(texto, p) }))
      .sort((a, b) => b.escore - a.escore);

    const melhor = ranking[0] ?? { indice: -1, escore: 0 };
    const segundo = ranking[1]?.escore ?? 0;
    const margem = Number((melhor.escore - segundo).toFixed(3));

    if (melhor.escore < ECO_MINIMO) {
      // Nem o vocabulário aparece: o comentário simplesmente não comenta esta
      // alternativa (comum) ou o texto extraído está corrompido (raro).
      vereditos[l] = {
        veredito: null,
        escore: melhor.escore,
        margem,
        eco_vocabulario: similaridadeVocabulario(texto, comentario),
      };
      continue;
    }

    // Empate entre parágrafos não decide nada. Alternativas de prova médica
    // diferem por uma palavra, e quando o discriminador é um caractere só ele
    // desaparece na tokenização: "Hepatite viral tipo A aguda" e "Hepatite viral
    // tipo B aguda" têm bigramas idênticos, então os dois parágrafos empatam em
    // 1.0 e o primeiro venceria por acidente. Foi o que acusou o gabarito da
    // questão 26 da Integradora 2025.1, que está correto.
    if (margem < MARGEM_MINIMA) {
      vereditos[l] = { veredito: null, escore: melhor.escore, margem, eco_vocabulario: 1, empate: true };
      continue;
    }

    const { veredito, origem } = vereditoDaAlternativa(paragrafos, secoes, melhor.indice, texto);
    vereditos[l] = { veredito, escore: melhor.escore, margem, eco_vocabulario: 1, origem };
  }

  const julgadasCorretas = presentes.filter((l) => vereditos[l]?.veredito === 'correta');

  // Confirmação por eliminação. Quando o comentário chama de incorretas todas as
  // alternativas menos a marcada, o gabarito está conferido tão bem quanto se o
  // comentário a nomeasse — e é o caso mais comum nesta prova, porque a
  // justificativa da correta parafraseia em vez de transcrever ("Correta. O caso
  // é típico de Glomerulonefrite Pós-Estreptocócica…" na questão 7).
  const outras = presentes.filter((l) => l !== marcada);
  const porEliminacao =
    marcada !== null &&
    outras.length >= 2 &&
    outras.every((l) => vereditos[l]?.veredito === 'incorreta');

  let cobertura = 'sem_eco';
  if (marcada && julgadasCorretas.length === 1 && julgadasCorretas[0] === marcada) {
    cobertura = 'forte';
  } else if (porEliminacao) {
    cobertura = 'forte_por_eliminacao';
  } else if (marcada && vereditos[marcada]?.veredito === 'correta') {
    cobertura = 'media';
  } else if (marcada && (vereditos[marcada]?.escore ?? 0) >= 0.45) {
    cobertura = 'presenca';
  }

  // Contradição de verdade: o comentário chama de correta uma alternativa que
  // não é a marcada, e não chama a marcada de correta.
  const contradiz = julgadasCorretas.filter((l) => l !== marcada);
  if (marcada && contradiz.length > 0 && vereditos[marcada]?.veredito !== 'correta') {
    flags.push({
      codigo: 'gabarito_contradiz_comentario',
      severidade: 'alta',
      detalhe:
        `(CORRETA) marca ${marcada.toUpperCase()}, mas a resposta comentada chama de correta ` +
        `${contradiz.map((l) => l.toUpperCase()).join(', ')}`,
    });
  }
  if (marcada && vereditos[marcada]?.veredito === 'incorreta') {
    flags.push({
      codigo: 'marcada_como_incorreta',
      severidade: 'alta',
      detalhe: `o comentário chama a alternativa ${marcada.toUpperCase()} de incorreta`,
    });
  }

  // Alternativa que não aparece em lugar nenhum do comentário nem por
  // vocabulário: candidata a texto corrompido na extração.
  for (const l of presentes) {
    const v = vereditos[l];
    if (v.veredito === null && v.eco_vocabulario < 0.34) {
      flags.push({
        codigo: 'alternativa_sem_eco',
        severidade: 'media',
        detalhe: `${l.toUpperCase()} não tem eco no comentário (vocabulário ${v.eco_vocabulario})`,
      });
    }
  }

  return { flags, cobertura, vereditos };
}

// ─────────────────────────── crivo 3: integridade ───────────────────────────

const RE_TRUNCADO = /[a-záéíóúâêôãõç,;]$/i;

export function crivoIntegridade(q) {
  const flags = [];

  for (const s of q.trechos_suspeitos ?? []) {
    flags.push({
      codigo: s.nivel === 'certo' ? 'texto_corrompido' : 'texto_a_conferir',
      severidade: s.nivel === 'certo' ? 'alta' : 'baixa',
      detalhe: `${s.campo}: ${s.marcas.slice(0, 6).join(' · ')}`,
    });
  }

  const campos = {
    enunciado: q.enunciado,
    enunciado_apoio: q.enunciado_apoio,
    // A resposta modelo entra no markdown como bloco de texto livre, então uma
    // linha dela que o parser do admin leia como rótulo corrompe a importação
    // do mesmo jeito que no enunciado.
    ...(q.resposta_modelo ? { resposta_modelo: q.resposta_modelo } : {}),
    ...Object.fromEntries(
      LETRAS.filter((l) => q.alternativas[l]).map((l) => [`alternativa ${l.toUpperCase()}`, q.alternativas[l]]),
    ),
  };

  for (const [nome, texto] of Object.entries(campos)) {
    if (!texto?.trim()) continue;
    const t = colapsar(texto);

    if (/[?]{2}|\[\?\]|�/.test(t)) {
      flags.push({ codigo: 'lacuna_no_texto', severidade: 'alta', detalhe: `${nome} tem marca de caractere perdido` });
    }
    // Parênteses desbalanceados denunciam corte no meio de um trecho.
    const abre = (t.match(/\(/g) ?? []).length;
    const fecha = (t.match(/\)/g) ?? []).length;
    if (abre !== fecha) {
      flags.push({
        codigo: 'parenteses_desbalanceados',
        severidade: 'media',
        detalhe: `${nome}: ${abre} "(" e ${fecha} ")"`,
      });
    }
    // Fim sem pontuação: o `-layout` corta a linha no fim da página, e quando o
    // autômato erra a transição a última frase fica pela metade.
    if (nome.startsWith('alternativa') && RE_TRUNCADO.test(t)) {
      flags.push({
        codigo: 'possivel_truncamento',
        severidade: 'media',
        detalhe: `${nome} termina em "${t.slice(-28)}"`,
      });
    }
    // Rótulo do parser do admin na primeira linha: a única forma que `gerar.mjs`
    // não consegue neutralizar grudando na linha anterior.
    const primeira = t.split('\n')[0] ?? '';
    if (RESERVADO.test(primeira)) {
      flags.push({
        codigo: 'rotulo_no_inicio',
        severidade: 'alta',
        detalhe: `${nome} começa com "${primeira.slice(0, 40)}", que o parser do admin leria como rótulo`,
      });
    }
  }

  return flags;
}

// ─────────────────────── crivo 4: mídia (pendência) ───────────────────────

/**
 * Imagem e tabela não são erro — são trabalho manual. Entram como severidade
 * `manual` para não se misturarem com defeito de extração no relatório, e para
 * não bloquearem a geração do markdown.
 */
export function crivoMidia(q) {
  const flags = [];
  if (q.tem_imagem) {
    flags.push({
      codigo: q.imagem_embutida ? 'imagem_embutida' : 'imagem_mencionada',
      severidade: 'manual',
      detalhe: q.sinais_imagem.join(' | '),
    });
  }
  if (q.tem_tabela) {
    flags.push({ codigo: 'tabela', severidade: 'manual', detalhe: q.sinais_tabela.join(' | ') });
  }
  return flags;
}

/** Junta os quatro crivos numa questão validada. */
export function validarQuestao(q) {
  const cruzamento = crivoCruzamento(q);
  const flags = [
    ...crivoEstrutura(q),
    ...cruzamento.flags,
    ...crivoIntegridade(q),
    ...crivoMidia(q),
  ];

  const ordem = { alta: 3, media: 2, baixa: 1, manual: 0 };
  const bloqueantes = flags.filter((f) => f.severidade !== 'manual');
  const severidadeMax = bloqueantes.length
    ? bloqueantes.reduce((a, f) => (ordem[f.severidade] > ordem[a] ? f.severidade : a), 'baixa')
    : null;

  return {
    numero: q.numero,
    paginas: q.paginas,
    codigo: q.codigo,
    formato: q.formato,
    // Maiúscula: é o contrato que `verificar-roundtrip.mjs` compara contra o que
    // o parser do admin devolve, e o parser devolve maiúscula.
    letra_oficial: q.letra_correta ? q.letra_correta.toUpperCase() : null,
    gabarito_origem: q.formato === 'aberta' ? 'resposta_comentada' : 'marcacao_correta',
    enunciado: q.enunciado,
    enunciado_apoio: q.enunciado_apoio,
    alternativas: q.alternativas,
    explicacao: q.explicacao,
    resposta_modelo: q.resposta_modelo ?? null,
    referencia: q.referencia,
    fonte_original: q.fonte_original,
    dificuldade: q.dificuldade,
    classificacao: q.classificacao,
    divisao: q.divisao,
    tem_imagem: q.tem_imagem,
    tem_tabela: q.tem_tabela,
    imagem_embutida: q.imagem_embutida,
    sinais_imagem: q.sinais_imagem,
    sinais_tabela: q.sinais_tabela,
    cobertura: cruzamento.cobertura,
    vereditos: cruzamento.vereditos,
    flags,
    severidade_max: severidadeMax,
  };
}
