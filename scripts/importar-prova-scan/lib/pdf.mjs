/**
 * Camada de PDF: classificação de páginas, parsing do gabarito/devolutiva e
 * extração das imagens do scan.
 *
 * Depende apenas de poppler-utils (pdftotext, pdfimages) — já instalado.
 * Nenhuma etapa deste arquivo envolve IA: se algo aqui produzir dado errado,
 * é bug, não alucinação.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { desdobrar } from './texto.mjs';

/** Divide o texto do PDF em páginas (form feed é o separador do pdftotext). */
export function paginasDeTexto(pdf) {
  let bruto = execFileSync('pdftotext', [pdf, '-'], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });

  // Quirk observado em relatórios gerados pelo wkhtmltopdf: o campo vazio
  // "Feedback:\n--" às vezes cai bem na quebra de página, e o pdftotext
  // gruda o segundo traço na linha seguinte — hash de autenticação
  // ("-000173...") ou marcador de questão ("-2ª QUESTÃO"). Remove esse
  // traço órfão para não quebrar o parsing estrutural.
  bruto = bruto.replace(
    /^-(?=\s*(?:\d{1,3}\s*[ªº°]\s*QUEST(?:Ã|A)O\s*$|[0-9a-f]{6}\.[0-9a-f]{6}\.))/gm,
    '',
  );

  const paginas = bruto.split('\f');
  // pdftotext emite um \f final; descarta o resto vazio.
  if (paginas.length > 0 && paginas.at(-1).trim() === '') paginas.pop();
  return paginas;
}

const RE_GABARITO_LINHA = /\b(\d{1,3})\s*\(\s*([A-Ea-e])\s*\)/g;
const RE_MARCADOR_QUESTAO = /^\s*(\d{1,3})\s*[ªº°]\s*QUEST(?:Ã|A)O\s*$/;

/**
 * Classifica cada página como `scan`, `gabarito`, `devolutiva` ou
 * `desconhecida`. A ordem dos testes importa: a folha de gabarito também
 * carrega o cabeçalho institucional, então ela é detectada primeiro.
 */
export function classificarPaginas(paginas) {
  const secoes = { scan: [], gabarito: [], devolutiva: [], desconhecida: [] };

  paginas.forEach((texto, i) => {
    const num = i + 1;
    const alfanum = (texto.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length;
    const paresGabarito = (texto.match(RE_GABARITO_LINHA) ?? []).length;

    if (/GABARITO\s+DE\s+PROVA/i.test(texto) || paresGabarito >= 10) {
      secoes.gabarito.push(num);
      return;
    }
    if (
      /RELAT[ÓO]RIO\s+DE\s+DEVOLUTIVA/i.test(texto) ||
      /Resposta\s+comentada\s*:/i.test(texto) ||
      texto.split('\n').some((l) => RE_MARCADOR_QUESTAO.test(l))
    ) {
      secoes.devolutiva.push(num);
      return;
    }
    // Páginas fotografadas não têm camada de texto — só ruído residual.
    if (alfanum < 60) {
      secoes.scan.push(num);
      return;
    }
    secoes.desconhecida.push(num);
  });

  // Páginas de continuação da devolutiva não têm marcador "Nª QUESTÃO" nem
  // rótulo "Resposta comentada:" — são só o final das referências da questão
  // anterior. Descartá-las perderia conteúdo em silêncio, então toda página
  // com texto dentro do intervalo contíguo da devolutiva é absorvida por ela.
  if (secoes.devolutiva.length > 0) {
    const ini = secoes.devolutiva[0];
    const fim = secoes.devolutiva.at(-1);
    const absorvidas = secoes.desconhecida.filter((n) => n > ini && n < fim);
    if (absorvidas.length > 0) {
      secoes.devolutiva = [...secoes.devolutiva, ...absorvidas].sort((a, b) => a - b);
      secoes.desconhecida = secoes.desconhecida.filter((n) => !absorvidas.includes(n));
      secoes.continuacao_devolutiva = absorvidas;
    }
  }

  return secoes;
}

/**
 * Extrai o gabarito oficial das folhas de gabarito.
 *
 * Formato no texto do PDF: número de 3 dígitos, espaço/quebras, letra entre
 * parênteses — `001\n\n(E )`. O `\s*` entre os grupos não atravessa outra
 * palavra, então "CADERNO 001" seguido de "Questão Resposta" não casa.
 *
 * @returns {{ gabarito: Record<string,string>, erros: string[] }}
 */
export function extrairGabarito(paginas, numerosDePagina) {
  const texto = numerosDePagina.map((n) => paginas[n - 1]).join('\n');
  const gabarito = {};
  const duplicados = [];
  const erros = [];

  for (const m of texto.matchAll(RE_GABARITO_LINHA)) {
    const numero = String(parseInt(m[1], 10));
    const letra = m[2].toUpperCase();
    if (gabarito[numero] && gabarito[numero] !== letra) {
      duplicados.push(`questão ${numero}: "${gabarito[numero]}" e "${letra}"`);
    }
    gabarito[numero] = letra;
  }

  const numeros = Object.keys(gabarito).map(Number).sort((a, b) => a - b);
  if (numeros.length === 0) {
    erros.push('nenhum par "NNN (X)" encontrado nas folhas de gabarito');
    return { gabarito, erros };
  }

  if (numeros[0] !== 1) erros.push(`gabarito começa na questão ${numeros[0]}, não na 1`);
  for (let i = 1; i < numeros.length; i += 1) {
    if (numeros[i] !== numeros[i - 1] + 1) {
      erros.push(`lacuna no gabarito entre ${numeros[i - 1]} e ${numeros[i]}`);
    }
  }
  if (duplicados.length > 0) {
    erros.push(`letras conflitantes — ${duplicados.join('; ')}`);
  }

  return { gabarito, erros };
}

/** Remove cabeçalho institucional e rodapé (hash + paginação) de uma página. */
function limparPaginaDevolutiva(texto) {
  let t = texto;

  // Cabeçalho: só existe na primeira página da seção; corta até o título.
  const cabecalho = t.match(/RELAT[ÓO]RIO\s+DE\s+DEVOLUTIVA\s+DE\s+PROVA\s*\n(?:PROVA[^\n]*\n)?/i);
  if (cabecalho) t = t.slice(cabecalho.index + cabecalho[0].length);

  return t
    .split('\n')
    .filter((l) => !/^\s*[0-9a-f]{6}\.[0-9a-f]{6}\./.test(l)) // hash de autenticação
    .filter((l) => !/^\s*P\W?gina\s+\d+\s+de\s+\d+\s*$/i.test(l)) // "Pgina 3 de 97"
    .join('\n');
}

const ROTULOS_COMENTARIO = /^\s*(?:Resposta\s+comentada|Gabarito\s+Comentado|Coment[áa]rios?)\s*:/i;
const ROTULOS_DISTRATOR = /^\s*(?:Distratores|Justificativa\s+das\s+alternativas|Justificativas?)\s*:/i;
const ROTULOS_REFERENCIA = /^\s*(?:Refer[êe]ncias?|Bibliografia)\s*:/i;
const ROTULOS_FEEDBACK = /^\s*Feedback\s*:/i;

/**
 * Fatia a devolutiva em um registro por questão.
 *
 * `bruto` é o que importa para o cruzamento — a fatia completa, sem perda.
 * A subdivisão em comentário/distratores/referências é best-effort: os
 * rótulos variam ("Distratores:", "Justificativa das alternativas:", ou
 * nenhum), então o fallback joga tudo em `comentario`.
 */
export function extrairDevolutiva(paginas, numerosDePagina) {
  const texto = numerosDePagina
    .map((n) => limparPaginaDevolutiva(paginas[n - 1]))
    .join('\n');

  const linhas = texto.split('\n');
  const blocos = [];
  let atual = null;

  for (const linha of linhas) {
    const m = linha.match(RE_MARCADOR_QUESTAO);
    if (m) {
      if (atual) blocos.push(atual);
      atual = { numero: parseInt(m[1], 10), linhas: [] };
      continue;
    }
    if (atual) atual.linhas.push(linha);
  }
  if (atual) blocos.push(atual);

  const devolutiva = {};
  const erros = [];

  for (const bloco of blocos) {
    const chave = String(bloco.numero);
    if (devolutiva[chave]) {
      erros.push(`questão ${chave} aparece mais de uma vez na devolutiva`);
      continue;
    }

    const secoes = { comentario: [], distratores: [], referencias: [], feedback: [] };
    let alvo = 'comentario';

    for (const linha of bloco.linhas) {
      if (ROTULOS_REFERENCIA.test(linha)) {
        alvo = 'referencias';
        const resto = linha.replace(ROTULOS_REFERENCIA, '').trim();
        if (resto) secoes.referencias.push(resto);
        continue;
      }
      if (ROTULOS_DISTRATOR.test(linha)) {
        alvo = 'distratores';
        const resto = linha.replace(ROTULOS_DISTRATOR, '').trim();
        if (resto) secoes.distratores.push(resto);
        continue;
      }
      if (ROTULOS_COMENTARIO.test(linha)) {
        alvo = 'comentario';
        const resto = linha.replace(ROTULOS_COMENTARIO, '').trim();
        if (resto) secoes.comentario.push(resto);
        continue;
      }
      // "Feedback:" costuma vir vazio (placeholder "--"); quando tem
      // conteúdo real, é comentário adicional e entra em `comentario`, sem
      // contaminar a seção anterior (geralmente `referencias`).
      if (ROTULOS_FEEDBACK.test(linha)) {
        alvo = 'feedback';
        const resto = linha.replace(ROTULOS_FEEDBACK, '').trim();
        if (resto) secoes.feedback.push(resto);
        continue;
      }
      secoes[alvo].push(linha);
    }

    const feedbackTexto = desdobrar(secoes.feedback.join('\n')).trim();
    const feedbackReal = feedbackTexto && feedbackTexto.replace(/-/g, '').trim() !== '' ? feedbackTexto : null;
    const comentarioBase = desdobrar(secoes.comentario.join('\n'));
    const comentario = feedbackReal ? [comentarioBase, feedbackReal].filter(Boolean).join('\n\n') : comentarioBase;

    const bruto = desdobrar(bloco.linhas.join('\n'));

    // Área/Subárea/Tema aparecem em parte das questões — sinal barato para
    // sugerir classificação depois, nunca usado como gabarito.
    const classificacao = {
      area: bruto.match(/\b[ÁA]rea\s*:\s*([^\n:]+?)(?:\s+Sub[áa]rea|\n|$)/i)?.[1]?.trim() ?? null,
      subarea: bruto.match(/\bSub[áa]rea\s*:\s*([^\n:]+?)(?:\s+Tema|\n|$)/i)?.[1]?.trim() ?? null,
      tema: bruto.match(/\bTema\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    };

    devolutiva[chave] = {
      bruto,
      comentario,
      distratores: desdobrar(secoes.distratores.join('\n')),
      referencias: desdobrar(secoes.referencias.join('\n')),
      declarado: declararCorreta(bruto),
      classificacao,
    };
  }

  return { devolutiva, erros };
}

/**
 * Marcador com que a devolutiva anuncia a resposta certa. Cobre as variações
 * observadas: "Resposta correta:", "RESPOSTA CORRETA :", "Alternativa
 * correta:", "A alternativa correta é a seguinte:", "Gabarito:", "CORRETA: -".
 */
const RE_MARCADOR_CORRETA = new RegExp(
  '(?:^|[\\n.;])\\s*(?:' +
    // "Alternativa correta:", "A resposta correta é", "Gabarito correto seria"
    '(?:(?:a|as)\\s+)?(?:alternativas?|respostas?|gabarito|op[çc][õo]es?|op[çc][ãa]o)\\s*' +
      'corretas?\\s*(?:é\\s+a\\s+seguinte|é|seria|s[ãa]o)?\\s*[:\\-—]?' +
    // "CORRETA: -" sem substantivo antes exige a pontuação
    '|corretas?\\s*[:\\-—]' +
  ')\\s*',
  'i',
);

/** Letra nomeada explicitamente como a correta, em qualquer ponto do texto. */
const RE_LETRA_NOMEADA =
  /\b(?:resposta|alternativa|gabarito|op[çc][ãa]o)\s+(?:correta\s+)?(?:é|seria|foi|:)?\s*(?:a\s+)?letra\s+["“']?([A-E])\b/i;

/**
 * Extrai o que a devolutiva declara explicitamente sobre a resposta certa.
 *
 * Dois sinais, ambos opcionais e ambos de alta precisão quando presentes:
 *  - `afirmacao`: o texto imediatamente após o marcador, que costuma ser a
 *    própria alternativa correta transcrita literalmente.
 *  - `letra`: a letra, quando a devolutiva a nomeia ("letra A", "alternativa
 *    B)"). Serve para conferir o gabarito oficial contra a devolutiva.
 *
 * A detecção de letra é deliberadamente restritiva: "Alternativa correta: O
 * volume total..." começa com "O", que não é designação de alternativa. Só
 * conta letra precedida de "letra"/"alternativa" ou isolada com pontuação.
 */
function declararCorreta(bruto) {
  const m = bruto.match(RE_MARCADOR_CORRETA);
  const janela = m
    ? bruto.slice(m.index + m[0].length, m.index + m[0].length + 260).split(/\n{2,}/)[0].trim()
    : '';

  // Em português "A" e "E" são artigo e conjunção, então letra solta seguida de
  // espaço é ruído: "Alternativa correta: A ressecção do mioma..." não declara
  // a letra A. Exige-se pontuação de designação, ou a palavra "letra" antes.
  const letra =
    janela.match(/^["“']?([A-E])\s?[).:]/)?.[1] ??
    janela.match(/^letra\s+["“']?([A-E])\b/i)?.[1] ??
    janela.match(/^alternativa\s+["“']?([A-E])\s?[).:,]/i)?.[1] ??
    bruto.match(RE_LETRA_NOMEADA)?.[1] ??
    null;

  return { afirmacao: janela || null, letra: letra ? letra.toUpperCase() : null };
}

/** Lê `pdfimages -list` para uma página e devolve as linhas do tipo `image`. */
function listarImagens(pdf, pagina) {
  const saida = execFileSync(
    'pdfimages',
    ['-list', '-f', String(pagina), '-l', String(pagina), pdf],
    { encoding: 'utf-8' },
  );
  return saida
    .split('\n')
    .slice(2) // duas linhas de cabeçalho
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, indice) => {
      const c = l.split(/\s+/);
      return {
        indice, // posição da imagem dentro da página — casa com o sufixo do arquivo
        tipo: c[2],
        largura: parseInt(c[3], 10) || 0,
        altura: parseInt(c[4], 10) || 0,
      };
    });
}

/**
 * Extrai a imagem principal de uma página do scan para `destino`.
 *
 * Prefere o stream JPEG embutido (cópia sem recompressão). Se a imagem
 * dominante não for JPEG, converte com Pillow. Máscaras e stickers (imagens
 * pequenas sobrepostas) são descartados pelo critério de maior área.
 *
 * @returns {{ arquivo: string, largura: number, altura: number } | null}
 */
export function extrairImagemDaPagina(pdf, pagina, destino, tmpDir) {
  const imagens = listarImagens(pdf, pagina).filter((i) => i.tipo === 'image');
  if (imagens.length === 0) return null;

  const principal = imagens.reduce((a, b) =>
    b.largura * b.altura > a.largura * a.altura ? b : a,
  );

  const prefixo = join(tmpDir, `pg${pagina}`);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  execFileSync('pdfimages', ['-j', '-f', String(pagina), '-l', String(pagina), pdf, prefixo]);

  const arquivos = readdirSync(tmpDir).sort();
  const alvo = arquivos.find((f) => f.startsWith(`pg${pagina}-${String(principal.indice).padStart(3, '0')}`));
  if (!alvo) return null;

  const origem = join(tmpDir, alvo);
  if (/\.jpe?g$/i.test(alvo)) {
    copyFileSync(origem, destino);
  } else {
    // ppm/pbm/png: converte preservando resolução nativa.
    execFileSync('python3', [
      '-c',
      'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],"JPEG",quality=95,subsampling=0)',
      origem,
      destino,
    ]);
  }

  return { arquivo: destino, largura: principal.largura, altura: principal.altura };
}

/** Lê JSON, devolvendo `null` se o arquivo não existir. */
export function lerJson(caminho) {
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, 'utf-8'));
}
