/**
 * Detecção de imagem e de tabela nas questões.
 *
 * É a razão de este pipeline existir separado do TPI. O relatório de devolutiva
 * da Integradora é texto puro: quando a questão original tinha uma figura, o
 * gerador do relatório **não a inclui** — some sem deixar rastro binário. E
 * quando tinha tabela, ela chega achatada em colunas de espaço, que virariam
 * prosa sem sentido se fossem convertidas em texto corrido.
 *
 * Nos dois casos a decisão é a mesma: **não converter, sinalizar**. O conteúdo
 * fica marcado para inserção manual no `/admin/questoes` em vez de entrar
 * deformado no acervo.
 *
 * Três sinais independentes, todos determinísticos e só com poppler-utils:
 *
 * | sinal | pega | não pega |
 * | --- | --- | --- |
 * | raster embutido (`pdfimages`) | figura que sobreviveu no PDF | figura descartada pelo gerador |
 * | menção no texto | figura descartada ("observe a imagem abaixo") | figura sem menção nenhuma |
 * | colunas alinhadas | tabela achatada, com ou sem grade vetorial | tabela de uma coluna só |
 */

import { execFileSync } from 'node:child_process';
import { colapsar, normalizar } from './texto.mjs';

// ──────────────────────────── imagem embutida ────────────────────────────

/**
 * Mapa `página → nº de imagens de conteúdo`.
 *
 * O logo da AFYA aparece no cabeçalho e não é conteúdo. Em vez de fixar
 * dimensão, descarta-se toda imagem cujo par largura×altura se repete em várias
 * páginas — elemento de template, por definição. Numa prova onde o logo só
 * aparece na página 1 isso não muda nada; numa em que ele se repete em todas,
 * evita 96 falsos positivos.
 */
export function imagensPorPagina(pdf) {
  const saida = execFileSync('pdfimages', ['-list', pdf], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const itens = saida
    .split('\n')
    .slice(2)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .filter((c) => c[2] === 'image')
    .map((c) => ({
      pagina: parseInt(c[0], 10),
      largura: parseInt(c[3], 10) || 0,
      altura: parseInt(c[4], 10) || 0,
    }))
    .filter((i) => i.pagina > 0);

  // Assinatura repetida em 2+ páginas = elemento de template (logo, marca).
  const paginasPorAssinatura = new Map();
  for (const i of itens) {
    const chave = `${i.largura}x${i.altura}`;
    paginasPorAssinatura.set(chave, (paginasPorAssinatura.get(chave) ?? new Set()).add(i.pagina));
  }
  const template = new Set(
    [...paginasPorAssinatura.entries()].filter(([, p]) => p.size >= 2).map(([k]) => k),
  );

  const porPagina = {};
  const descartadas = [];
  for (const i of itens) {
    const chave = `${i.largura}x${i.altura}`;
    // O logo do cabeçalho na página 1 de um relatório de página única não tem
    // repetição para delatá-lo: a página 1 nunca traz questão, então é seguro.
    if (template.has(chave) || i.pagina === 1) {
      descartadas.push({ ...i, motivo: template.has(chave) ? 'template' : 'pagina_de_capa' });
      continue;
    }
    porPagina[i.pagina] = (porPagina[i.pagina] ?? 0) + 1;
  }

  return { porPagina, descartadas };
}

// ──────────────────────────── menção no texto ────────────────────────────

/**
 * Substantivos que anunciam uma figura. `quadro` está fora de propósito: em
 * texto médico "quadro clínico", "quadro febril" e "esse quadro" são o caso do
 * paciente, e apareciam dezenas de vezes por prova. Quadro só conta com
 * indicação dêitica, tratada em RE_QUADRO_TABELA abaixo.
 */
const RE_FIGURA = new RegExp(
  '\\b(?:' +
    'imagem|imagens|figura|figuras|fotografia|foto|ilustra[çc][ãa]o|esquema|' +
    'gr[áa]fico|gr[áa]ficos|fluxograma|organograma|infogr[áa]fico|' +
    'radiografia|radiograma|raio-?x|tomografia|resson[âa]ncia|ultrassonografia|' +
    'ecografia|endoscopia|colonoscopia|eletrocardiograma|ecg|eletroencefalograma|' +
    'l[âa]mina|hematoscopia|mamografia|cintilografia|angiografia|arteriografia|' +
    'fundoscopia|dermatoscopia|pe[çc]a\\s+anatomopatol[óo]gica' +
  ')\\b',
  'i',
);

/**
 * Dêixis: a palavra só indica figura anexa quando o texto aponta para ela
 * ("a imagem abaixo", "observe a figura", "na radiografia a seguir"). Sem isso,
 * "a ultrassonografia mostrou cálculo de 8 mm" é achado narrado por escrito, que
 * não precisa de figura nenhuma.
 */
const RE_DEIXIS = new RegExp(
  '(?:' +
    '\\b(?:abaixo|acima|a\\s+seguir|ao\\s+lado|apresentad[ao]s?|exibid[ao]s?|' +
    'mostrad[ao]s?|ilustrad[ao]s?|anexad[ao]s?|em\\s+anexo|a\\s+seguinte)\\b' +
    '|\\b(?:observe|analise|avalie|note|veja|considere|interprete|descreva)\\b' +
    '|\\b(?:figura|quadro|tabela|gr[áa]fico|imagem)\\s*\\d' +
  ')',
  'i',
);

/**
 * `quadro`/`tabela` como grade de dados, e não como quadro clínico.
 *
 * `quadro` + dêixis ficou **fora**. A dêixis desambigua figura ("observe a
 * radiografia abaixo"), mas não desambigua `quadro`: em prosa médica
 * *"Diante do quadro acima, analise as assertivas"* é o caso do paciente, e foi
 * o único "achado" de tabela da Integradora 2024.2 — falso positivo. Sobram as
 * formas em que a palavra só pode ser grade: `tabela`, `quadro 2`,
 * `quadro comparativo`.
 *
 * O preço é perder a tabela introduzida como "o quadro abaixo" cujas células não
 * ficaram alinhadas pelo `-layout`. Tabela de verdade é pega por
 * `linhasTabulares()`, que é sinal estrutural e não depende de como o enunciado
 * a chama.
 */
const RE_QUADRO_TABELA = new RegExp(
  '\\b(?:tabela|tabelas)\\b' +
    '|\\bquadro\\s+(?:\\d|comparativo|resumo|resumido|sin[óo]ptico|demonstrativo)',
  'i',
);

/**
 * Frase que menciona figura E aponta para ela. Devolve as frases suspeitas, não
 * um booleano: o relatório mostra a frase para o usuário decidir, porque nenhum
 * regex distingue "a radiografia abaixo" (figura) de "a radiografia mostrou
 * consolidação" (achado escrito) em 100% dos casos.
 */
export function mencoesDeFigura(texto) {
  const frases = colapsar(texto).split(/(?<=[.:;?!])\s+/);
  return frases
    .filter((f) => RE_FIGURA.test(f) && RE_DEIXIS.test(f))
    .map((f) => colapsar(f))
    .filter((f) => f.length > 8);
}

/** Frase que menciona tabela/quadro de dados. */
export function mencoesDeTabela(texto) {
  const frases = colapsar(texto).split(/(?<=[.:;?!])\s+/);
  return frases
    .filter((f) => RE_QUADRO_TABELA.test(f))
    .map((f) => colapsar(f))
    .filter((f) => f.length > 8);
}

// ────────────────────────── colunas alinhadas ──────────────────────────

/**
 * Linhas em que o `-layout` preservou 2+ colunas separadas por 3+ espaços.
 *
 * É como uma tabela chega num PDF de texto: a grade é vetorial (invisível ao
 * `pdftotext`) mas as células ficam alinhadas por espaço. Duas linhas assim
 * seguidas quase nunca acontecem em prosa.
 *
 * A justificação de texto do próprio relatório produz linhas com espaços largos
 * nas referências bibliográficas ("2024.    E-book.    ISBN    978..."), então
 * o chamador passa só o enunciado — nunca a bibliografia.
 */
export function linhasTabulares(linhas) {
  const tabulares = [];
  linhas.forEach((linha, i) => {
    if (!/\S/.test(linha)) return;
    const colunas = linha.trim().split(/\s{3,}/).filter(Boolean);
    if (colunas.length < 2) return;
    // Coluna de uma letra ou de um caractere é artefato de justificação.
    if (colunas.every((c) => c.length <= 2)) return;
    tabulares.push({ indice: i, colunas: colunas.length, texto: colapsar(linha) });
  });

  // Exige bloco: uma linha isolada com espaço largo é justificação, não tabela.
  const blocos = [];
  let atual = [];
  for (const t of tabulares) {
    if (atual.length > 0 && t.indice > atual.at(-1).indice + 1) {
      if (atual.length >= 2) blocos.push(atual);
      atual = [];
    }
    atual.push(t);
  }
  if (atual.length >= 2) blocos.push(atual);

  return blocos;
}

// ──────────────────────────── veredito ────────────────────────────

const PLACEHOLDER_TABELA = '[TABELA DA PROVA — não convertida em texto; inserir manualmente]';

/**
 * Junta os três sinais num veredito por questão.
 *
 * `tem_imagem` e `tem_tabela` nunca alteram o texto que vai para o markdown com
 * uma exceção: o bloco de colunas alinhadas é **substituído** pelo placeholder,
 * porque achatá-lo em prosa é exatamente o que se quer evitar. Menção a figura
 * não remove nada — não há nada para remover, a figura já não está no PDF.
 */
export function classificarMidia(q, imagensPorPagina, donosPorPagina = {}) {
  const rasters = q.paginas.reduce((s, p) => s + (imagensPorPagina[p] ?? 0), 0);

  // Uma questão termina no meio da página em que a seguinte começa, então uma
  // imagem nessa página tem dois donos possíveis e só um é o certo. Na
  // Integradora 2024.2 a tabela de falha dos contraceptivos (página 36) era
  // atribuída à questão 24, que é dela, **e** à 25, que é sobre fases do parto.
  // A ambiguidade é detectável sem ler a imagem, então entra como sinal.
  const paginasCompartilhadas = q.paginas
    .filter((p) => (imagensPorPagina[p] ?? 0) > 0)
    .map((p) => ({ pagina: p, donos: (donosPorPagina[p] ?? []).filter((n) => n !== q.numero) }))
    .filter((x) => x.donos.length > 0);
  const textoDoEnunciado = [q.enunciado_apoio, q.enunciado].filter(Boolean).join('\n\n');

  const figuraNoTexto = mencoesDeFigura(textoDoEnunciado);
  const tabelaNoTexto = mencoesDeTabela(textoDoEnunciado);
  const blocosTabulares = linhasTabulares(q.enunciado_bruto.split('\n'));

  const sinaisImagem = [];
  if (rasters > 0) {
    const comImagem = q.paginas.filter((p) => (imagensPorPagina[p] ?? 0) > 0);
    sinaisImagem.push(`${rasters} imagem(ns) embutida(s) na(s) página(s) ${comImagem.join(', ')}`);
  }
  for (const c of paginasCompartilhadas) {
    sinaisImagem.push(
      `ATENÇÃO: a página ${c.pagina} é dividida com a questão ${c.donos.join(', ')} — ` +
      'a imagem pode ser dela; confira antes de anexar',
    );
  }
  for (const f of figuraNoTexto) sinaisImagem.push(`menção: "${f.slice(0, 120)}"`);

  const sinaisTabela = [];
  for (const b of blocosTabulares) {
    sinaisTabela.push(`${b.length} linhas com ${b[0].colunas}+ colunas alinhadas`);
  }
  for (const t of tabelaNoTexto) sinaisTabela.push(`menção: "${t.slice(0, 120)}"`);

  return {
    tem_imagem: sinaisImagem.length > 0,
    tem_tabela: sinaisTabela.length > 0,
    imagem_embutida: rasters > 0,
    paginas_com_imagem: q.paginas.filter((p) => (imagensPorPagina[p] ?? 0) > 0),
    imagem_compartilhada: paginasCompartilhadas,
    sinais_imagem: sinaisImagem,
    sinais_tabela: sinaisTabela,
    blocos_tabulares: blocosTabulares.map((b) => b.map((l) => l.texto)),
  };
}

/**
 * Remove do texto os blocos de colunas alinhadas, deixando o placeholder.
 *
 * Preserva a ordem: o placeholder fica onde a tabela estava, para quem for
 * inserir a grade no admin saber em que ponto do enunciado ela entra.
 */
export function substituirTabelas(texto) {
  const linhas = texto.split('\n');
  const blocos = linhasTabulares(linhas);
  if (blocos.length === 0) return { texto, substituidos: 0 };

  const remover = new Map();
  for (const b of blocos) {
    for (const l of b) remover.set(l.indice, b[0].indice);
  }

  const saida = [];
  for (let i = 0; i < linhas.length; i += 1) {
    if (!remover.has(i)) {
      saida.push(linhas[i]);
      continue;
    }
    if (remover.get(i) === i) saida.push(PLACEHOLDER_TABELA);
  }

  return { texto: saida.join('\n'), substituidos: blocos.length };
}

export { PLACEHOLDER_TABELA };

/** Só para o relatório: confere se o placeholder não virou rótulo do parser. */
export function placeholderSeguro() {
  return !/^\s*(?:ENUNCIADO|ALTERNATIVAS|GABARITO|TIPO|FONTE|EXPLICACAO|REFERENCIA)/i.test(
    normalizar(PLACEHOLDER_TABELA),
  );
}
