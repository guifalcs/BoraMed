/**
 * Parsing do "RELATÓRIO DE DEVOLUTIVA DE PROVA" da AFYA.
 *
 * Serve qualquer prova que chegue nesse formato — Integradora, SOI, HAM, N1/N2
 * específica —, porque o que o pipeline entende é o **relatório**, não a
 * disciplina. O que muda entre elas é secundário e está tratado aqui: o título
 * da prova, a presença ou não do bloco "Filtros da questão" e a existência de
 * questões discursivas (as SOI e HAM trazem duas por prova; a Integradora,
 * nenhuma).
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
  // `-enc UTF-8` explícito: o pdftotext embarcado no Git for Windows emite na
  // codepage local, e aí "QUESTÃO" chega como bytes Latin-1 lidos como UTF-8 —
  // nenhum rótulo casa e o relatório inteiro sai vazio, sem erro nenhum.
  const bruto = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, '-'], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
  // Builds de poppler para Windows emitem CRLF; o `\r` sobrando no fim de cada
  // linha quebra o `$` das regex de rótulo (RE_MARCADOR_QUESTAO, CAMPOS), porque
  // `.` não casa `\r` e a posição antes dele não é fim de string. Normaliza antes
  // de fatiar em páginas/linhas.
  const semCRLF = bruto.replace(/\r\n/g, '\n');
  const paginas = normalizarTipografia(semCRLF).split('\f');
  if (paginas.length > 0 && paginas.at(-1).trim() === '') paginas.pop();
  return paginas;
}

/**
 * Marcador de questão, que **não** ocupa a linha inteira em toda prova.
 *
 * Na Integradora ele sempre vem sozinho, e por isso a primeira versão desta
 * regex era ancorada em `^…$`. Nas provas de SOI e HAM o `-layout` costuma
 * colocá-lo na mesma linha de outro elemento, separado por um vão largo:
 *
 *     Enunciado:                              1ª QUESTÃO
 *     Unidade de avaliação:      1ª QUESTÃO      www.acervo.top/soi-iv
 *
 * Ancorado, o marcador não casava e a questão inteira era engolida pela
 * anterior — 11 das 13 questões da SOI 2022.2 desapareciam em silêncio. Agora
 * casa no meio da linha, exigindo vão largo (ou borda) dos dois lados, e
 * `fatiarQuestoes` redistribui o que sobra da linha.
 */
/**
 * Relatório em duas colunas: rótulos empilhados à esquerda e o texto todo numa
 * coluna indentada à direita.
 *
 * É o formato das provas de 2022.2, e ele quebra a premissa central do parser —
 * a de que o rótulo abre a seção que vem depois dele. Ali `Alternativas:`
 * aparece na altura da **segunda linha do enunciado**, porque a coluna da
 * esquerda empilha os rótulos sem acompanhar o fluxo da direita; o autômato
 * transiciona cedo e o enunciado vira alternativa.
 *
 * A detecção é por indentação, e separa os dois formatos sem ambiguidade: nas
 * provas em coluna única 1% a 3% das linhas de conteúdo começam depois da
 * coluna 15; nas de 2022.2, 84% a 86%. Serve para o pipeline dizer *por que*
 * parou, em vez de acusar "Q2 sem enunciado" cinco vezes.
 */
export function ehLayoutDeDuasColunas(paginas) {
  const linhas = paginas.join('\n').split('\n').filter((l) => l.trim().length > 20);
  if (linhas.length < 40) return false;
  const indentadas = linhas.filter((l) => l.match(/^ */)[0].length >= 15).length;
  return indentadas / linhas.length > 0.5;
}

const RE_MARCADOR_QUESTAO = /(?:^|\s{2,})(\d{1,3})\s*[^\w\s]{0,3}\s*QUEST(?:Ã|A)O(?=\s{2,}|\s*$)/;
// O ordinal é aceito como "qualquer 0–3 caracteres não alfanuméricos" porque em
// PDF digitalizado ele nem sempre sai como `ª`: a SOI 2023.1 traz `12!! QUESTÃO`,
// e o resultado era uma lacuna na numeração que reprovava a prova inteira.

// `\s*` entre os grupos: no mesmo PDF o hash de autenticação sai espaçado
// (`000072. 59001d. 5076bb.`), e aí a linha passava a limpeza e entrava como
// conteúdo de campo.
const RE_HASH = /^\s*[0-9a-f]{6}\.\s*[0-9a-f]{6}\./;
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

/**
 * Linhas de template da página 1 — nunca fazem parte do título da prova.
 */
const RE_TEMPLATE_CAPA =
  /^(?:AFYA\b|NOTA\s*FINAL|CURSO\s+DE\s+MEDICINA|Aluno\s*:|Professor|Componente\s+Curricular|Per[íi]odo\s*:|Turma\s*:|Data\s*:)/i;

/**
 * Extrai o cabeçalho da prova (só existe na página 1) para o manifesto.
 *
 * O título é posicional, não lexical: são as linhas soltas imediatamente
 * **acima** de "RELATÓRIO DE DEVOLUTIVA DE PROVA", depois de descartar o
 * template da capa. Procurar por uma palavra-chave não serve — a primeira
 * versão procurava `INTEGRADORA` e não achava nada em SOI nem em HAM — e
 * filtrar por caixa alta também não: a SOI 2023.1 escreve
 * `Nl ESPECIFICA SOi 4 04MAIO2023`, com caixa mista e erro de digitação.
 *
 * O título pode vir quebrado em duas linhas quando é longo
 * ("N1 ESPECÍFICA - MEDICINA - SOI IV - 2025.2 - 1ª CHAMADA -" / "29/SETEMBRO"),
 * então as linhas são juntadas.
 */
export function cabecalhoDaProva(paginas) {
  const p1 = paginas[0] ?? '';
  const linha = (re) => p1.match(re)?.[1]?.trim() ?? null;

  const linhas = p1.split('\n').map((l) => l.trim());
  const iRelatorio = linhas.findIndex((l) => /RELAT[ÓO]RIO\s+DE\s+DEVOLUTIVA/i.test(l));

  const tituloLinhas = [];
  for (let i = iRelatorio - 1; i >= 0; i -= 1) {
    const l = linhas[i];
    if (!l) {
      if (tituloLinhas.length > 0) break; // linha em branco fecha o bloco do título
      continue;
    }
    if (RE_TEMPLATE_CAPA.test(l)) break;
    tituloLinhas.unshift(l);
  }

  return {
    titulo: tituloLinhas.length > 0 ? colapsar(tituloLinhas.join(' ')) : null,
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
/**
 * Rótulo que **abre** uma questão, e só ele.
 *
 * Serve para decidir de quem é o texto que divide a linha com o marcador:
 * `Enunciado:` e `Unidade de avaliação:` antes de `1ª QUESTÃO` pertencem à
 * questão que está começando; `Feedback:` antes de `8ª QUESTÃO` (HAM 2024.2)
 * é o último campo da que terminou. Incluir os rótulos de fechamento nesta
 * lista fazia a questão anterior perder o campo e a nova começar com lixo.
 */
const RE_ROTULO_DE_ABERTURA =
  /^\s*(?:C[óo]digo\s+da\s+quest|Tipo\s+da\s+quest|Unidade\s+de\s+avalia|Enunciado)\b/i;

export function fatiarQuestoes(paginas) {
  const blocos = [];
  let atual = null;
  const erros = [];

  paginas.forEach((bruta, i) => {
    const num = i + 1;
    for (const linha of limparPagina(bruta).split('\n')) {
      const m = linha.match(RE_MARCADOR_QUESTAO);
      if (m) {
        // O marcador pode dividir a linha com conteúdo dos dois lados. Nada é
        // descartado: o que vem antes é da questão que fecha (a menos que seja
        // rótulo, e aí é da que abre) e o que vem depois é sempre da que abre.
        const antes = linha.slice(0, m.index);
        const depois = linha.slice(m.index + m[0].length);
        const antesEhRotulo = RE_ROTULO_DE_ABERTURA.test(antes);

        if (antes.trim() && atual && !antesEhRotulo) atual.linhas.push(antes);
        if (atual) blocos.push(atual);
        atual = { numero: parseInt(m[1], 10), linhas: [], paginas: [num] };
        if (antes.trim() && antesEhRotulo) atual.linhas.push(antes);
        if (depois.trim()) atual.linhas.push(depois);
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

  // Sigla em caixa alta seguida de nome próprio em caixa mista: `(AFYA Bragança)`,
  // `(FASA Vic)`, `(AFYA Cruzeiro do Sul)`. Só as provas de Integradora trazem o
  // filtro `[IES]` para confirmar; nas de SOI e HAM esta é a única forma de
  // reconhecer a origem, e sem ela a sigla ficava no meio do enunciado.
  //
  // A exigência de a **primeira palavra** ser sigla em caixa alta é o que separa
  // isso de um parêntese de conteúdo: nenhum caso clínico abre com
  // `(Doença de Chagas)`, e `(alternativa A)` nem chega aqui.
  if (/^[A-ZÀ-Ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ0-9.\-/]+){0,5}$/.test(conteudo)) return semPrefixo;

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

/** Parágrafo que abre um subitem de comando: `a) Caracterize…`, `b) Explique…`. */
const RE_ITEM_DE_COMANDO = /^\s*([a-e])\s*\)\s*\S/i;

/**
 * Corte de enunciado que termina numa lista de subitens.
 *
 * É o formato das questões discursivas destas provas: caso clínico, uma frase
 * que abre o comando e os itens a serem respondidos.
 *
 *     Um paciente, de 32 anos, sem comorbidades, apresenta febre, disúria…
 *     Considerando o quadro clínico e laboratorial, responda às perguntas a seguir.
 *     a) Caracterize o quadro clínico do paciente e cite o provável agente etiológico.
 *     b) Explique os mecanismos fisiopatológicos subjacentes à infecção urinária.
 *     c) Baseado na etiologia, descreva o tratamento farmacológico adequado.
 *
 * Sem esta regra o corte por parágrafo levaria **só o item `c)`** para
 * `ENUNCIADO` e empurraria `a)` e `b)` para o texto de apoio: nada se perderia,
 * mas a questão entraria no acervo perguntando um terço do que pergunta.
 *
 * Exige dois itens em sequência alfabética a partir de `a)` — um item isolado é
 * item de lista dentro do caso clínico, não comando.
 */
function cortarNosItens(paragrafos) {
  const primeiro = paragrafos.findIndex((p) => /^\s*a\s*\)\s*\S/i.test(p));
  if (primeiro < 1) return null; // sem itens, ou a questão inteira é a lista

  const letras = paragrafos
    .slice(primeiro)
    .map((p) => p.match(RE_ITEM_DE_COMANDO)?.[1]?.toLowerCase() ?? null);
  const esperadas = ['a', 'b', 'c', 'd', 'e'];
  let n = 0;
  while (n < letras.length && letras[n] === esperadas[n]) n += 1;
  if (n < 2) return null;

  // Os itens têm que fechar o enunciado: item seguido de mais prosa é lista
  // dentro do caso clínico ("a) … b) … Com base no exposto, assinale…"), e aí
  // quem decide é o corte por parágrafo.
  const depoisDosItens = paragrafos.slice(primeiro + n).filter((p) => p.trim());
  if (depoisDosItens.length > 0) return null;

  // A frase que introduz os itens ("…responda às perguntas a seguir.") faz parte
  // do comando, não do caso; entra na pergunta quando é reconhecível como tal.
  const introduz = ehPergunta(paragrafos[primeiro - 1] ?? '');
  const inicio = introduz ? primeiro - 1 : primeiro;
  if (inicio === 0) return null; // sobraria apoio vazio

  return {
    apoio: paragrafos.slice(0, inicio).join('\n\n'),
    pergunta: paragrafos.slice(inicio).join('\n\n'),
    criterio: 'itens',
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

  // 0. Enunciado com subitens — o formato das discursivas.
  const porItens = cortarNosItens(paragrafos);
  if (porItens) return porItens;

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

/**
 * Classifica a questão em fechada (múltipla escolha) ou aberta (discursiva).
 *
 * O relatório não declara o formato: a questão discursiva é a que emite
 * `Alternativas:` seguido de `--`, e a resposta esperada vem na resposta
 * comentada. Duas por prova nas de SOI e HAM; nenhuma nas de Integradora.
 *
 * O terceiro valor, `indefinido`, existe porque "sem alternativa nenhuma" é
 * exatamente o que se vê quando o autômato de rótulos erra e come o campo. Sem
 * ele, uma questão de múltipla escolha mutilada entraria no acervo como
 * discursiva — perda silenciosa disfarçada de formato. Só é aberta quando o
 * campo veio de fato vazio (`--`); campo com texto que não virou alternativa é
 * bloqueio.
 */
export function classificarFormato(alternativas, brutoAlternativas) {
  if (Object.keys(alternativas).length > 0) return 'fechada';
  const resto = colapsar(brutoAlternativas).replace(/[-–—\s]/g, '');
  return resto === '' ? 'aberta' : 'indefinido';
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
  const formato = classificarFormato(alternativas, juntar('alternativas'));

  const feedback = colapsar(juntar('feedback')).replace(/^-+$/, '');
  const comentario = desdobrar(juntar('comentario'));

  return {
    numero: bloco.numero,
    paginas: bloco.paginas,
    formato,
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
    // Na discursiva a resposta comentada **é** o gabarito: o admin a importa como
    // RESPOSTA_MODELO, que é o que o aluno vê e o que a Aurora usa para corrigir.
    // Repeti-la em EXPLICACAO só duplicaria o mesmo texto no acervo.
    explicacao: formato === 'aberta' ? '' : comentario,
    resposta_modelo: formato === 'aberta' ? comentario : null,
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
      ...paragrafosSuspeitos(juntar('comentario')).map((s) => ({
        campo: formato === 'aberta' ? 'resposta_modelo' : 'explicacao',
        ...s,
      })),
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
