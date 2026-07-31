/**
 * Parsing do "RELATÓRIO DE DEVOLUTIVA DE PROVA" da AFYA para prova Integradora.
 *
 * Ao contrário do TPI, aqui o PDF é **gerado**, não digitalizado: tem camada de
 * texto em 100% das páginas e traz a resposta certa marcada em linha
 * (`(alternativa C) (CORRETA)`). Todo este arquivo é determinístico — nenhuma
 * etapa envolve IA. Se algo aqui produzir dado errado, é bug, não alucinação.
 *
 * Depende apenas de poppler-utils (pdftotext, pdfimages).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { desdobrar, colapsar, normalizar } from './texto.mjs';

/** Ligaduras tipográficas que a fonte embutida usa e o `pdftotext` preserva. */
const LIGADURAS = {
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi',
  'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st',
};

const COMBINANTE = '\\u0300-\\u036f';

/**
 * Normaliza a tipografia extraída do PDF.
 *
 * Defeitos reais desta prova, todos invisíveis a olho nu e todos quebrando busca
 * no acervo. Só entram aqui reparos **inequívocos** — nada que exija adivinhar
 * qual palavra era:
 *
 * - **Ligaduras**: `ﬁsiopatológico` é um único codepoint (U+FB01), então buscar
 *   "fisiopatológico" no /admin/questoes não acha a questão.
 * - **Acentos decompostos**: a fonte emite parte dos acentos como marca
 *   combinante (NFD) e parte pré-composta, no mesmo PDF. `"ação"` com til
 *   combinante e `"ação"` pré-composto são strings diferentes para o Postgres.
 * - **Espaço antes da marca combinante**: `ilı ́aca`. O acento pertence à letra
 *   anterior por definição — não existe marca combinante isolada em português.
 * - **`i` sem pingo (U+0131) acentuado**: `ı` + acento agudo é como esta fonte
 *   escreve `í`. Português não usa `ı` em nenhuma palavra.
 *
 * NFC depois disso, e nunca NFKC: `NFKC` esmagaria `Na⁺`, `Cl⁻` e `µ`, que são
 * conteúdo clínico.
 *
 * O que **não** dá para reparar assim fica para `paragrafosSuspeitos()`.
 */
export function normalizarTipografia(texto) {
  return texto
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGADURAS[c] ?? c)
    .replace(new RegExp(`[ \\t]+([${COMBINANTE}])`, 'g'), '$1')
    .replace(new RegExp(`\\u0131([${COMBINANTE}])`, 'g'), 'i$1')
    .normalize('NFC');
}

/**
 * Sinais de que o `pdftotext` leu um trecho com o espaçamento embaralhado.
 *
 * Uma prova real trouxe um parágrafo inteiro assim, e é a razão de este detector
 * existir: na questão 46 desta Integradora, a devolutiva saiu como
 *
 *     "A dor é localizada na regiã o epigá strica, acompanhada dnáuseasas
 *      e vô mitos […] o peritô nio periapendicular. A febre nã o costuma…"
 *
 * `regiã o`, `epigá strica`, `vô mitos` e `nã o` são espaço espúrio injetado
 * dentro da palavra; `dnáuseasas` perdeu e duplicou caractere de verdade. Nenhum
 * dos dois se repara mecanicamente sem dicionário, e nenhum é detectável pelos
 * crivos de estrutura — o texto passa por prosa válida.
 *
 * Dois níveis, porque um detector só não dá conta:
 *
 * - **certo** — palavra terminada em `ã`, `õ` ou `ô` seguida de fragmento
 *   minúsculo. A lista de palavras portuguesas com esse fim é fechada e curta
 *   (`manhã`, `irmã`, `avô`…), então `regiã o` e `peritô nio` são corrupção com
 *   certeza prática. Vira flag alta.
 * - **fraco** — mesma forma terminada em `á`, `é`, `í`, `ó`, `ú`, `â` ou `ê`.
 *   Aqui `está dentro`, `até os`, `já que` e `prevê mais` são português correto e
 *   frequentes, então isso só entra no relatório para conferência, sem bloquear.
 *
 * `ê` ficou de fora do nível "certo" depois de acusar indevidamente a questão 25
 * da Integradora 2025.1: a frase é *"a rede Alyne, que **prevê mais** estrutura"*,
 * e `prevê` é correto. A terminação em `ê` não é fechada como as nasais — as
 * formas verbais de terceira pessoa (`vê`, `lê`, `crê`, `prevê`, `provê`, `revê`)
 * são uma classe aberta.
 */

/** Palavras que legitimamente terminam em ã/õ/ô — a lista é fechada. */
const FINAL_NASAL_VALIDO = new Set([
  'manhã', 'amanhã', 'irmã', 'irmãs', 'lã', 'romã', 'afegã', 'órfã', 'sã', 'vã',
  'cristã', 'alemã', 'anã', 'ímã', 'hortelã', 'avelã', 'lôbrego',
  'avô', 'vô', 'robô', 'dominô', 'capô', 'pô',
]);

const RE_CERTO = /([a-záéíóúâêôãõàçñ]{2,})([ãõô])\s+([a-z]{1,6})\b/gi;
const RE_FRACO = /([a-záéíóúâêôãõàçñ]{3,})([áéíóúâê])\s+([a-z]{1,6})\b/gi;

export function paragrafosSuspeitos(texto) {
  const achados = [];

  for (const paragrafo of (texto ?? '').split(/\n{2,}/)) {
    const certos = [];
    for (const m of paragrafo.matchAll(RE_CERTO)) {
      const palavra = (m[1] + m[2]).toLowerCase();
      if (FINAL_NASAL_VALIDO.has(palavra)) continue;
      certos.push(colapsar(m[0]));
    }
    const fracos = [...paragrafo.matchAll(RE_FRACO)].map((m) => colapsar(m[0]));

    if (certos.length === 0 && fracos.length < 3) continue;
    achados.push({
      nivel: certos.length > 0 ? 'certo' : 'fraco',
      trecho: colapsar(paragrafo).slice(0, 200),
      marcas: [...new Set([...certos, ...fracos])],
    });
  }

  return achados;
}

/**
 * Divide o texto do PDF em páginas.
 *
 * `-layout` e não o modo padrão: o modo padrão colapsa a linha em branco que
 * separa o caso clínico da pergunta final, e essa linha é o que permite dividir
 * `enunciado_apoio` de `enunciado` sem adivinhar. `-layout` também preserva o
 * alinhamento de colunas, que é o sinal usado para detectar tabela.
 */
export function paginasDeTexto(pdf) {
  const bruto = execFileSync('pdftotext', ['-layout', pdf, '-'], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const paginas = normalizarTipografia(bruto).split('\f');
  if (paginas.length > 0 && paginas.at(-1).trim() === '') paginas.pop();
  return paginas;
}

const RE_MARCADOR_QUESTAO = /^\s*(\d{1,3})\s*[ªº°]\s*QUEST(?:Ã|A)O\s*$/;
const RE_HASH = /^\s*[0-9a-f]{6}\.[0-9a-f]{6}\./;
const RE_PAGINACAO = /^\s*P\W?gina\s+\d+\s+de\s+\d+\s*$/i;

/** Remove cabeçalho institucional (só na página 1), hash de autenticação e paginação. */
export function limparPagina(texto) {
  let t = texto;

  const cabecalho = t.match(
    /RELAT[ÓO]RIO\s+DE\s+DEVOLUTIVA\s+DE\s+PROVA\s*\n(?:\s*PROVA[^\n]*\n)?/i,
  );
  if (cabecalho) t = t.slice(cabecalho.index + cabecalho[0].length);

  return t
    .split('\n')
    .filter((l) => !RE_HASH.test(l))
    .filter((l) => !RE_PAGINACAO.test(l))
    .join('\n');
}

/** Extrai o cabeçalho da prova (só existe na página 1) para o manifesto. */
export function cabecalhoDaProva(paginas) {
  const p1 = paginas[0] ?? '';
  const linha = (re) => p1.match(re)?.[1]?.trim() ?? null;
  // O título da prova é a linha em caixa alta ("INTEGRADORA - MEDICINA - 4º
  // PERÍODO - 2025.2 - 1ª CHAMADA"). Filtrar por caixa alta é o que a separa de
  // "Componente Curricular: Integradora 4º Período", que aparece antes na página.
  const emCaixaAlta = (l) => {
    const letras = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letras.length < 12) return false;
    return letras === letras.toUpperCase();
  };

  return {
    titulo: p1
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /INTEGRADORA/i.test(l) && emCaixaAlta(l)) ?? null,
    componente: linha(/Componente\s+Curricular\s*:\s*([^\n]+)/i),
    periodo: linha(/Per[íi]odo\s*:\s*(\d{6})/i),
    data: linha(/Data\s*:\s*(\d{2}\/\d{2}\/\d{4})/i),
    prova: linha(/PROVA\s+(\d+)/i),
    caderno: linha(/CADERNO\s+(\d+)/i),
  };
}

/**
 * Fatia o relatório em um bloco de linhas por questão, registrando em que
 * páginas cada questão aparece (a página serve para localizar a figura e para
 * o relatório de pendências).
 */
export function fatiarQuestoes(paginas) {
  const blocos = [];
  let atual = null;
  const erros = [];

  paginas.forEach((bruta, i) => {
    const num = i + 1;
    for (const linha of limparPagina(bruta).split('\n')) {
      const m = linha.match(RE_MARCADOR_QUESTAO);
      if (m) {
        if (atual) blocos.push(atual);
        atual = { numero: parseInt(m[1], 10), linhas: [], paginas: [num] };
        continue;
      }
      if (!atual) continue;
      if (!atual.paginas.includes(num)) atual.paginas.push(num);
      atual.linhas.push(linha);
    }
  });
  if (atual) blocos.push(atual);

  const vistos = new Set();
  for (const b of blocos) {
    if (vistos.has(b.numero)) erros.push(`questão ${b.numero} aparece mais de uma vez no relatório`);
    vistos.add(b.numero);
  }
  const numeros = [...vistos].sort((a, b) => a - b);
  if (numeros.length === 0) {
    erros.push('nenhum marcador "Nª QUESTÃO" encontrado — o PDF não é um relatório de devolutiva AFYA');
  } else {
    if (numeros[0] !== 1) erros.push(`o relatório começa na questão ${numeros[0]}, não na 1`);
    for (let i = 1; i < numeros.length; i += 1) {
      if (numeros[i] !== numeros[i - 1] + 1) {
        erros.push(`lacuna entre as questões ${numeros[i - 1]} e ${numeros[i]}`);
      }
    }
  }

  return { blocos, erros };
}

/**
 * Campos do relatório, em ordem canônica de emissão.
 *
 * Duas regras desambiguam rótulo de conteúdo, e as duas são necessárias:
 *
 * 1. **O autômato só avança.** "Resposta comentada:" aparece 51 vezes numa prova
 *    de 50 questões porque um comentário cita o próprio rótulo; a segunda
 *    ocorrência dentro do mesmo campo é conteúdo. Mesma regra de "primeira
 *    ocorrência ganha" do parser do /admin/importar.
 *
 * 2. **Casamento sensível à caixa.** Sem isso, a questão 7 desta prova perdia as
 *    quatro alternativas em silêncio: o enunciado traz a linha
 *
 *        referência: 0,4 a 0,9 mg/dL).
 *
 *    (continuação de "creatinina: 1,1 mg/dL (valor de referência: ...)" quebrada
 *    pelo `-layout`), que casava com `Referências:` e pulava o autômato do
 *    enunciado direto para a bibliografia. O gerador do relatório emite o rótulo
 *    sempre capitalizado; prosa de prova, não.
 */
const CAMPOS = [
  { chave: 'codigo', re: /^\s*C[óo]digo\s+da\s+quest[ãa]o\s*:\s*(.*)$/, linha: true },
  { chave: 'tipo', re: /^\s*Tipo\s+da\s+quest[ãa]o\s*:\s*(.*)$/, linha: true },
  { chave: 'unidade', re: /^\s*Unidade\s+de\s+avalia[çc][ãa]o\s*:\s*(.*)$/, linha: true },
  { chave: 'enunciado', re: /^\s*Enunciado\s*:\s*(.*)$/, bloco: true },
  { chave: 'alternativas', re: /^\s*Alternativas\s*:\s*(.*)$/, bloco: true },
  { chave: 'dificuldade', re: /^\s*Grau\s+de\s+dificuldade\s*:\s*(.*)$/, linha: true },
  { chave: 'comentario', re: /^\s*Resposta\s+comentada\s*:\s*(.*)$/, bloco: true },
  { chave: 'referencias', re: /^\s*Refer[êe]ncias?\s*:\s*(.*)$/, bloco: true },
  { chave: 'feedback', re: /^\s*Feedback\s*:\s*(.*)$/, bloco: true },
  // O único rótulo que aparece grudado em conteúdo na prática ("--Filtros da
  // questão:", porque o Feedback vazio é "--"), então casa no meio da linha.
  { chave: 'filtros', re: /Filtros\s+da\s+quest[ãa]o\s*:\s*(.*)$/, meio: true },
];

/** Campos sem os quais a questão não pode ser importada. */
export const CAMPOS_OBRIGATORIOS = ['enunciado', 'alternativas'];

/**
 * Conteúdo na margem direita da linha do rótulo.
 *
 * Campo de bloco (`enunciado`, `alternativas`, `comentario`, `referencias`) sempre
 * começa o valor na linha **seguinte** ao rótulo neste relatório. Quando o
 * `-layout` põe algo na mesma linha separado por um vão largo, é conteúdo de
 * margem, não valor: na Integradora 2024.2 a linha era
 *
 *     Enunciado:                    www.acervo.top/integradora-iv ou acervotop.com/integradora-iv
 *
 * — marca d'água de quem redistribuiu o PDF, que entrava como a primeira linha do
 * enunciado da questão 1 e ainda empurrava o `(FACIMPA)` para o meio do texto,
 * quebrando a detecção de origem.
 *
 * O vão de 5+ espaços é o que separa isso de `Enunciado: texto` legítimo, com um
 * espaço. `filtros` fica de fora da regra: lá a chave `[Semanas]` **é** emitida na
 * linha do rótulo, com vão largo, e é valor de verdade.
 */
const RE_VAO_DE_MARGEM = /:[ \t]{5,}\S/;

const RE_ALTERNATIVA = /^\s*\(\s*alternativa\s+([A-Ea-e])\s*\)\s*(\(\s*CORRETA\s*\))?\s*(.*)$/i;

/**
 * Aplica o autômato de campos a um bloco de questão.
 *
 * @returns {{campos: Record<string,string[]>, avisos: string[]}}
 */
function separarCampos(bloco) {
  const campos = Object.fromEntries(CAMPOS.map((c) => [c.chave, []]));
  const avisos = [];
  let indice = -1; // posição em CAMPOS do campo corrente

  for (const linha of bloco.linhas) {
    let transitou = false;

    for (let i = 0; i < CAMPOS.length; i += 1) {
      const campo = CAMPOS[i];
      if (i <= indice) continue; // só avança: repetição é conteúdo
      const m = linha.match(campo.re);
      if (!m) continue;

      // Rótulo casado no meio da linha: o que vinha antes é conteúdo do campo
      // anterior e não pode ser descartado.
      if (campo.meio) {
        const antes = linha.slice(0, m.index);
        if (antes.trim() && indice >= 0) campos[CAMPOS[indice].chave].push(antes);
      }

      indice = i;
      if (m[1].trim()) {
        if (campo.bloco && RE_VAO_DE_MARGEM.test(linha)) {
          // Nunca descarta em silêncio: vira aviso da extração.
          avisos.push(`margem descartada na linha de "${campo.chave}": "${colapsar(m[1]).slice(0, 80)}"`);
        } else {
          campos[campo.chave].push(m[1]);
        }
      }
      transitou = true;
      break;
    }
    if (transitou) continue;

    if (indice < 0) {
      if (linha.trim()) avisos.push(`linha antes do primeiro rótulo: "${colapsar(linha).slice(0, 60)}"`);
      continue;
    }
    // Campo de valor único: a linha seguinte é continuação só se o valor ainda
    // estiver vazio (o `-layout` às vezes joga o valor para a linha de baixo).
    const campo = CAMPOS[indice];
    if (campo.linha && campos[campo.chave].some((l) => l.trim())) continue;
    campos[campo.chave].push(linha);
  }

  return { campos, avisos };
}

/** Lê o bloco `[Chave]` / valores indentados dos "Filtros da questão". */
function parsearFiltros(linhas) {
  const filtros = {};
  let chave = null;
  for (const linha of linhas) {
    const m = linha.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      chave = colapsar(m[1]);
      filtros[chave] = filtros[chave] ?? [];
      if (m[2].trim()) filtros[chave].push(m[2].trim());
      continue;
    }
    if (chave && linha.trim()) filtros[chave].push(linha.trim());
  }
  return Object.fromEntries(
    Object.entries(filtros).map(([k, v]) => [k, desduplicar(colapsar(v.join(' ')))]),
  );
}

/**
 * Colapsa valor de filtro repetido: o relatório emite `[IES]` duas vezes em parte
 * das questões ("AFYA PARAÍBA AFYA PARAÍBA"), e isso vazava para o CSV de
 * classificação e para o campo FONTE.
 */
function desduplicar(valor) {
  const metade = (valor.length - 1) / 2;
  if (!Number.isInteger(metade)) return valor;
  const a = valor.slice(0, metade);
  const b = valor.slice(metade + 1);
  return a === b && valor[metade] === ' ' ? a : valor;
}

/** Separa as alternativas e a letra marcada `(CORRETA)`. */
function parsearAlternativas(linhas) {
  const alternativas = {};
  const corretas = [];
  const avisos = [];
  let letra = null;

  for (const linha of linhas) {
    const m = linha.match(RE_ALTERNATIVA);
    if (m) {
      letra = m[1].toLowerCase();
      if (alternativas[letra] !== undefined) {
        avisos.push(`alternativa ${letra.toUpperCase()} aparece duas vezes`);
      }
      alternativas[letra] = alternativas[letra] ?? [];
      if (m[2]) corretas.push(letra);
      if (m[3].trim()) alternativas[letra].push(m[3]);
      continue;
    }
    if (letra) alternativas[letra].push(linha);
  }

  return {
    alternativas: Object.fromEntries(
      Object.entries(alternativas).map(([l, ls]) => [l, desdobrar(ls.join('\n'))]),
    ),
    corretas: [...new Set(corretas)],
    avisos,
  };
}

/**
 * Prefixo de origem no começo do enunciado — `(FESAR)`, `(AFYA SANTA INÊS)`.
 *
 * Vai para `FONTE` e sai do enunciado, como no pipeline do TPI. O critério é
 * estrutural (parênteses só com maiúsculas/pontuação, no início absoluto), o
 * que não confunde com `(alternativa A)` nem com uma sigla no meio do texto.
 */
function separarOrigem(texto, ies) {
  const m = texto.match(/^\s*\(\s*([^)\n]{2,70})\)\s*/);
  if (!m) return { origem: null, texto };

  const conteudo = colapsar(m[1]);
  const semPrefixo = { origem: conteudo, texto: texto.slice(m.index + m[0].length) };

  // Caminho preferido: o filtro `[IES]` da própria questão confirma que aquele
  // parêntese é a origem. Duas fontes concordando é melhor que qualquer regra de
  // formato — e é o que faz `(AFYA Paraíba)` funcionar, que a regra de caixa alta
  // não pegava (27 das 50 questões da Integradora 2025.1 são assim).
  if (ies) {
    const a = normalizar(ies);
    const b = normalizar(conteudo);
    if (a === b || a.includes(b) || b.includes(a)) return semPrefixo;
  }

  // Sem filtro `[IES]`: só caixa alta conta, para não confundir com um
  // parêntese de conteúdo no começo do enunciado.
  if (/^[A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9.\-/\s]*$/.test(conteudo)) return semPrefixo;

  return { origem: null, texto };
}

/**
 * Aberturas de comando/pergunta — o que uma frase de prova usa para sair da
 * narrativa do caso e pedir a resposta. Ancorado no início da frase.
 */
const ABERTURA_DE_COMANDO =
  '(?:com\\s+base|considerando|diante\\s+d\\w+|a\\s+partir\\s+d\\w+|de\\s+acordo\\s+com|' +
  'acerca\\s+d\\w+|em\\s+rela[çc][ãa]o\\s+a\\w*|quanto\\s+a\\w*|' +
  'sobre\\s+(?:o|a|as|os|esse|essa|este|esta)|' +
  'ness[ae]\\s+(?:contexto|situa[çc][ãa]o|caso|cen[áa]rio|momento)|' +
  'nest[ae]\\s+(?:contexto|caso|cen[áa]rio|momento)|' +
  'na\\s+situa[çc][ãa]o|no\\s+cen[áa]rio|frente\\s+a\\w*|perante|ap[óo]s|' +
  'assinale|marque|indique|aponte|selecione|escolha|julgue|analise|avalie|' +
  'identifique|responda|descreva|explique|justifique|correlacione|' +
  'qual|quais|quanto|como\\s+(?:deve|proceder)|dentre|entre\\s+as\\s+op[çc][õo]es|' +
  // "Apenas está correta o que se afirma em:" — fechamento de questão de
  // assertivas, que não abre com verbo de comando nenhum.
  // Terminar a alternativa numa fronteira de palavra real importa: escrita como
  // `corret`, o `\b` que fecha RE_ABERTURA cai entre "t" e "o" e nunca casa.
  '(?:apenas\\s+|somente\\s+)?(?:[ée]|est[áa]|est[ãa]o|s[ãa]o)\\s+(?:in)?corret[oa]s?|' +
  '(?:apenas|somente)\\s+(?:a|as|o|os)\\b|' +
  '[ée]\\s+(?:poss[íi]vel|verdadeiro)|o\\s+que\\s+se\\s+afirma)';

const RE_ABERTURA = new RegExp(`^\\s*${ABERTURA_DE_COMANDO}\\b`, 'i');

/**
 * Fechamento de enunciado que termina em `:` em vez de `?`.
 *
 * "A alternativa que melhor representa a conduta adequada é:" e "Após colocar os
 * dados nos gráficos, a melhor conduta a ser tomada é:" não abrem com verbo de
 * comando nenhum, mas são inequivocamente a pergunta. O `:` sozinho não serve
 * (um cabeçalho como "Assertivas:" também termina assim), então exige-se também
 * substantivo de prova e tamanho mínimo.
 */
const RE_FECHAMENTO_DOIS_PONTOS =
  /\b(?:alternativas?|assertivas?|afirmativas?|op[çc][õo]es|op[çc][ãa]o|resposta|conduta|diagn[óo]stico|hip[óo]tese|conclus[ãa]o|sequ[êe]ncia|classifica|correta?|corretos?)\b[^:]*:\s*$/i;

/** Verbo de comando em qualquer posição — pega "…, assinale a alternativa…". */
const RE_IMPERATIVO =
  /\b(?:assinale|marque|indique|aponte|selecione|escolha|julgue|analise|avalie|identifique|responda|correlacione)\b/i;

/**
 * Um parágrafo é a pergunta final se abre com comando, traz imperativo, termina
 * em `?` ou fecha em `:` com substantivo de prova.
 *
 * Terminar em `?` é o sinal mais forte e mais geral dos quatro: nenhum parágrafo
 * de caso clínico termina em interrogação.
 */
function ehPergunta(paragrafo) {
  const t = paragrafo.trim();
  // Piso curto de propósito: "Estão corretas:" é pergunta de verdade (questão 27
  // da 2025.1). Um cabeçalho como "Assertivas:" fica abaixo do piso, e de todo
  // modo só o **último** parágrafo é candidato — cabeçalho nunca é o último.
  if (t.length < 12) return false;
  return (
    /\?\s*$/.test(t) ||
    RE_ABERTURA.test(t) ||
    RE_IMPERATIVO.test(t) ||
    RE_FECHAMENTO_DOIS_PONTOS.test(t)
  );
}

/** Limite de tamanho para o que pode passar por "pergunta final". */
const MAX_PERGUNTA = 400;

/**
 * Fronteira de frase imediatamente antes de uma abertura de comando.
 *
 * Existe porque em 18 das 50 questões desta prova o caso clínico e a pergunta
 * estão no **mesmo parágrafo**, sem linha em branco entre eles: "…estava
 * esperando as dores das contrações aumentarem. Analise a situação descrita…".
 * Sem este corte, essas questões entrariam com o caso inteiro no `ENUNCIADO`.
 */
const RE_FRONTEIRA = new RegExp(`(?<=[.!?])\\s+(?=${ABERTURA_DE_COMANDO}\\b)`, 'gi');

/**
 * Última fronteira de frase do parágrafo, sem depender de lista de palavras.
 *
 * Serve ao caso em que o parágrafo **termina em `?`**: aí a última frase é a
 * pergunta, e não há lista de aberturas que precise acertar. Foi o que resolveu
 * as questões 2, 35 e 37 da Integradora 2025.1 — "…sem sinais de desidratação.
 * Diante do quadro, qual deve ser a conduta médica mais adequada?" — em que o
 * caso e a pergunta vêm no mesmo parágrafo.
 *
 * Exige maiúscula (ou parêntese) depois da pontuação, o que evita cortar em
 * "1,1 mg/dL. " no meio de uma lista de exames.
 */
const RE_FIM_DE_FRASE = /(?<=[.!?])\s+(?=[A-ZÀ-Ÿ(])/g;

function separarUltimaFrase(paragrafo) {
  const fronteiras = [...paragrafo.matchAll(RE_FIM_DE_FRASE)];
  if (fronteiras.length === 0) return null;
  const ultima = fronteiras.at(-1);
  return {
    antes: paragrafo.slice(0, ultima.index).trim(),
    frase: paragrafo.slice(ultima.index + ultima[0].length).trim(),
  };
}

/**
 * Divide o enunciado em `enunciado_apoio` (caso clínico, exames, afirmativas) e
 * `enunciado` (a pergunta final).
 *
 * Dois cortes, tentados em ordem, e nenhum deles descarta ou reordena texto:
 *
 * 1. **por parágrafo** — o último parágrafo é a pergunta.
 * 2. **por frase** — dentro do último parágrafo, a última fronteira de frase
 *    seguida de abertura de comando.
 *
 * Quando nenhum dos dois se aplica com segurança, o enunciado inteiro fica num
 * campo só. `ENUNCIADO_APOIO` é opcional no /admin/importar, então não dividir
 * é sempre válido — e um corte errado é pior que nenhum corte. Na questão 18,
 * por exemplo, a pergunta está no meio (seguida das assertivas I–IV): dividir
 * exigiria reordenar, então a regra corretamente não divide.
 */
export function dividirEnunciado(bruto) {
  const paragrafos = desdobrar(bruto).split('\n\n').filter((p) => p.trim());
  const inteiro = paragrafos.join('\n\n');
  if (paragrafos.length === 0) return { apoio: '', pergunta: '', criterio: 'vazio' };

  const ultimo = paragrafos.at(-1);

  // 1. Corte por parágrafo.
  if (
    paragrafos.length >= 2 &&
    colapsar(ultimo).length <= MAX_PERGUNTA &&
    ehPergunta(ultimo)
  ) {
    return {
      apoio: paragrafos.slice(0, -1).join('\n\n'),
      pergunta: ultimo,
      criterio: 'paragrafo',
    };
  }

  // Monta o resultado de um corte dentro do último parágrafo, reaproveitando os
  // parágrafos anteriores como apoio.
  const cortarNoParagrafo = (antes, pergunta, criterio) => {
    const apoio = [...paragrafos.slice(0, -1), antes]
      .filter((p) => p.trim())
      .join('\n\n');
    if (!apoio.trim()) return null;
    if (colapsar(pergunta).length > MAX_PERGUNTA) return null;
    if (!ehPergunta(pergunta)) return null;
    return { apoio, pergunta, criterio };
  };

  // 2. Corte por frase seguida de abertura de comando.
  const partes = ultimo.split(RE_FRONTEIRA);
  if (partes.length >= 2) {
    const corte = cortarNoParagrafo(partes.slice(0, -1).join(' ').trim(), partes.at(-1).trim(), 'frase');
    if (corte) return corte;
  }

  // 3. Corte na última frase, quando ela é interrogativa. Não depende de lista
  // de aberturas: o `?` no fim é o sinal.
  const ultimaFrase = separarUltimaFrase(ultimo);
  if (ultimaFrase && /\?\s*$/.test(ultimaFrase.frase)) {
    const corte = cortarNoParagrafo(ultimaFrase.antes, ultimaFrase.frase, 'frase_interrogativa');
    if (corte) return corte;
  }

  return { apoio: '', pergunta: inteiro, criterio: 'campo_unico' };
}

/** Parseia um bloco de questão inteiro. */
export function parsearQuestao(bloco) {
  const { campos, avisos } = separarCampos(bloco);
  const juntar = (chave) => campos[chave].join('\n');

  // Filtros primeiro: o `[IES]` é o que confirma o prefixo de origem do enunciado.
  const filtros = parsearFiltros(campos.filtros);

  const enunciadoBruto = juntar('enunciado');
  const { origem, texto: semOrigem } = separarOrigem(desdobrar(enunciadoBruto), filtros['IES']);
  const { apoio, pergunta, criterio } = dividirEnunciado(semOrigem);
  const { alternativas, corretas, avisos: avisosAlt } = parsearAlternativas(campos.alternativas);

  const feedback = colapsar(juntar('feedback')).replace(/^-+$/, '');

  return {
    numero: bloco.numero,
    paginas: bloco.paginas,
    codigo: colapsar(juntar('codigo')) || null,
    tipo_declarado: colapsar(juntar('tipo')) || null,
    unidade: colapsar(juntar('unidade')) || null,
    dificuldade: colapsar(juntar('dificuldade')) || null,
    fonte_original: origem,
    enunciado_bruto: desdobrar(enunciadoBruto),
    enunciado: pergunta,
    enunciado_apoio: apoio,
    divisao: criterio,
    alternativas,
    letra_correta: corretas.length === 1 ? corretas[0] : null,
    corretas_marcadas: corretas,
    explicacao: desdobrar(juntar('comentario')),
    referencia: desdobrar(juntar('referencias')),
    feedback: feedback || null,
    filtros,
    classificacao: {
      area: filtros['Áreas de Conhecimento'] ?? filtros['Areas de Conhecimento'] ?? null,
      subarea: filtros['Subáreas de Conhecimento'] ?? filtros['Subareas de Conhecimento'] ?? null,
      semana: filtros['Semanas'] ?? null,
      modulo: filtros['Módulos integrados'] ?? filtros['Modulos integrados'] ?? null,
      ies: filtros['IES'] ?? null,
      competencia: filtros['Competências (Objetivos)'] ?? filtros['Habilidades'] ?? null,
    },
    // Roda nos campos que vão para o acervo. `feedback` fica de fora: é sempre
    // "--" e não é importado.
    trechos_suspeitos: [
      ...paragrafosSuspeitos(enunciadoBruto).map((s) => ({ campo: 'enunciado', ...s })),
      ...Object.entries(alternativas).flatMap(([l, t]) =>
        paragrafosSuspeitos(t).map((s) => ({ campo: `alternativa ${l.toUpperCase()}`, ...s })),
      ),
      ...paragrafosSuspeitos(juntar('comentario')).map((s) => ({ campo: 'explicacao', ...s })),
    ],
    avisos: [...avisos, ...avisosAlt],
  };
}

/**
 * Confere o prefixo de origem do enunciado contra o filtro `[IES]`.
 *
 * Duas fontes independentes do mesmo dado dentro do próprio PDF: quando as duas
 * existem e discordam, uma das duas leituras está errada e vale olhar.
 */
export function conferirOrigem(q) {
  const ies = q.classificacao.ies;
  if (!ies || !q.fonte_original) return null;
  const a = normalizar(ies);
  const b = normalizar(q.fonte_original);
  if (a === b || a.includes(b) || b.includes(a)) return null;
  return `origem no enunciado ("${q.fonte_original}") diverge do filtro [IES] ("${ies}")`;
}

/** Lê JSON, devolvendo `null` se o arquivo não existir. */
export function lerJson(caminho) {
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, 'utf-8'));
}
