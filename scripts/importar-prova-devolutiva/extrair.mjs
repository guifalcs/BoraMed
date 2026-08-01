#!/usr/bin/env node
/**
 * FASE 1 — Extração determinística do relatório de devolutiva da AFYA.
 *
 * Serve qualquer prova nesse formato: Integradora, SOI, HAM. O PDF é gerado,
 * não digitalizado — camada de texto em todas as páginas e a resposta certa
 * marcada em linha (`(alternativa C) (CORRETA)`). Não há nada aqui que precise
 * de IA: enunciado, alternativas, gabarito, explicação, referências e
 * classificação saem por regex do próprio PDF.
 *
 * Uso:
 *   node extrair.mjs "SOI 4 - (2025.2).pdf"
 *
 * Sai com exit 1 quando o PDF não tem a estrutura esperada, em vez de adivinhar.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  paginasDeTexto,
  cabecalhoDaProva,
  fatiarQuestoes,
  parsearQuestao,
  conferirOrigem,
  ehLayoutDeDuasColunas,
} from './lib/relatorio.mjs';
import { imagensPorPagina, classificarMidia } from './lib/midia.mjs';
import { colapsar } from './lib/texto.mjs';

const pdf = process.argv[2];
if (!pdf) {
  console.error('uso: node extrair.mjs "<prova>.pdf"');
  process.exit(2);
}
if (!existsSync(pdf)) {
  console.error(`arquivo não encontrado: ${pdf}`);
  process.exit(2);
}

const slug = basename(pdf)
  .replace(/\.pdf$/i, '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const dir = resolve(join(import.meta.dirname, '.trabalho', slug));
mkdirSync(dir, { recursive: true });

console.log(`prova : ${basename(pdf)}`);
console.log(`destino: ${dir}\n`);

// ──── Páginas e cabeçalho ────

const paginas = paginasDeTexto(pdf);
const cabecalho = cabecalhoDaProva(paginas);

const semTexto = paginas.filter((p) => (p.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length < 60).length;
console.log(`páginas: ${paginas.length} (${semTexto} sem camada de texto)`);

const bloqueios = [];
if (ehLayoutDeDuasColunas(paginas)) {
  bloqueios.push(
    'este relatório vem em DUAS COLUNAS (rótulos à esquerda, texto à direita) — formato das ' +
    'provas de 2022.2. O parser assume o layout linear das edições de 2023 em diante e leria ' +
    'metade do enunciado como alternativa. Não há caminho automático: importe essa prova pelo ' +
    '/admin/questoes ou converta o PDF antes.',
  );
}
if (semTexto > 0) {
  bloqueios.push(
    `${semTexto} página(s) sem camada de texto — este pipeline só serve para relatório ` +
    'de devolutiva gerado. Prova digitalizada vai pela skill importar-prova-scan.',
  );
}

// ──── Questões ────

const { blocos, erros } = fatiarQuestoes(paginas);
bloqueios.push(...erros);

const imagens = imagensPorPagina(pdf);
const questoes = [];
const avisos = [];
if (imagens.indisponivel) {
  avisos.push(
    `${imagens.indisponivel} — sem detecção de raster embutido nesta rodada; ` +
    'a menção com dêixis no enunciado continua valendo',
  );
}

// Parseia tudo antes de classificar mídia: a atribuição de imagem precisa saber
// quais questões dividem cada página (ver `classificarMidia`).
const parseadas = blocos.map((bloco) => parsearQuestao(bloco));

const donosPorPagina = {};
for (const q of parseadas) {
  for (const p of q.paginas) (donosPorPagina[p] ??= []).push(q.numero);
}

for (const q of parseadas) {
  const midia = classificarMidia(q, imagens.porPagina, donosPorPagina);
  const divergencia = conferirOrigem(q);
  if (divergencia) avisos.push(`Q${q.numero}: ${divergencia}`);
  for (const a of q.avisos) avisos.push(`Q${q.numero}: ${a}`);
  questoes.push({ ...q, ...midia });
}

// Campo obrigatório vazio significa que o autômato de rótulos pulou uma seção —
// perda silenciosa, o pior modo de falha possível. Foi assim que a questão 7 da
// Integradora de calibração ficou sem nenhuma alternativa antes de os rótulos
// passarem a casar com sensibilidade à caixa. Bloqueia em vez de gerar markdown
// mutilado.
//
// O que é obrigatório depende do formato: a discursiva não tem alternativa por
// definição, e cobrá-las dela reprovaria as duas questões abertas de toda prova
// de SOI e HAM. O que substitui a exigência lá é a resposta comentada, que é o
// gabarito da questão.
for (const q of questoes) {
  const faltando = [];
  if (!q.enunciado.trim()) faltando.push('enunciado');
  if (q.formato === 'fechada' && Object.keys(q.alternativas).length < 2) {
    faltando.push(`alternativas (${Object.keys(q.alternativas).length})`);
  }
  if (q.formato === 'aberta' && !(q.resposta_modelo ?? '').trim()) {
    faltando.push('resposta comentada (é o gabarito da discursiva)');
  }
  if (q.formato === 'indefinido') {
    faltando.push('alternativas reconhecíveis — o campo "Alternativas:" tem texto que não virou alternativa');
  }
  if (faltando.length > 0) {
    bloqueios.push(`Q${q.numero} (p.${q.paginas.join(',')}): sem ${faltando.join(' e ')}`);
  }
}

if (bloqueios.length > 0) {
  console.error('\n── ESTRUTURA INESPERADA ──');
  for (const b of bloqueios) console.error(`  • ${b}`);
  console.error('\nNão siga: algo seria perdido em silêncio. Investigue o PDF apontado.');
  process.exit(1);
}

// ──── Persistência ────

const manifesto = {
  pdf: basename(pdf),
  slug,
  paginas: paginas.length,
  cabecalho,
  questoes: questoes.length,
  imagens_descartadas: imagens.descartadas,
  paginas_com_imagem: Object.keys(imagens.porPagina).map(Number).sort((a, b) => a - b),
  avisos,
};

writeFileSync(join(dir, 'manifesto.json'), JSON.stringify(manifesto, null, 2), 'utf-8');
writeFileSync(join(dir, 'questoes.json'), JSON.stringify({ questoes }, null, 2), 'utf-8');

// O bloco "Filtros da questão" só existe nas provas de Integradora; em SOI e HAM
// o relatório não traz classificação nenhuma. Gerar um CSV com 15 linhas vazias
// sugeriria que a classificação existe e saiu em branco por bug.
const temClassificacao = questoes.some((q) =>
  Object.values(q.classificacao).some((v) => v) || q.codigo || q.dificuldade,
);
if (temClassificacao) {
  const csv = ['numero,codigo,area,subarea,semana,modulo,ies,dificuldade,competencia'];
  for (const q of questoes) {
    const c = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    csv.push([
      q.numero, c(q.codigo), c(q.classificacao.area), c(q.classificacao.subarea),
      c(q.classificacao.semana), c(q.classificacao.modulo), c(q.classificacao.ies),
      c(q.dificuldade), c(q.classificacao.competencia),
    ].join(','));
  }
  writeFileSync(join(dir, 'classificacao-sugerida.csv'), csv.join('\n') + '\n', 'utf-8');
}

// ──── Resumo ────

const fechadas = questoes.filter((q) => q.formato === 'fechada');
const abertas = questoes.filter((q) => q.formato === 'aberta');
const semGabarito = fechadas.filter((q) => !q.letra_correta);
const comImagem = questoes.filter((q) => q.tem_imagem);
const comTabela = questoes.filter((q) => q.tem_tabela);
const porDivisao = (c) => questoes.filter((q) => q.divisao === c).length;

console.log(`\nquestões        : ${questoes.length} (${fechadas.length} fechadas, ${abertas.length} discursivas)`);
if (abertas.length > 0) console.log(`  discursivas   : Q${abertas.map((q) => q.numero).join(', Q')}`);
console.log(`cabeçalho       : ${cabecalho.titulo ?? '(não identificado)'}`);
console.log(`  componente    : ${cabecalho.componente ?? '—'}   data: ${cabecalho.data ?? '—'}`);
console.log(`gabarito inline : ${fechadas.length - semGabarito.length}/${fechadas.length} fechadas com (CORRETA) única`);
console.log(`com imagem      : ${comImagem.length}${comImagem.length ? ` → Q${comImagem.map((q) => q.numero).join(', Q')}` : ''}`);
console.log(`com tabela      : ${comTabela.length}${comTabela.length ? ` → Q${comTabela.map((q) => q.numero).join(', Q')}` : ''}`);
console.log(
  `apoio/pergunta  : ${porDivisao('paragrafo')} por parágrafo, ${porDivisao('frase')} por frase, ` +
  `${porDivisao('campo_unico')} em campo único`,
);

if (avisos.length > 0) {
  console.log(`\navisos (${avisos.length}):`);
  for (const a of avisos.slice(0, 15)) console.log(`  • ${a}`);
  if (avisos.length > 15) console.log(`  … +${avisos.length - 15}`);
}

console.log('\nescrito:');
console.log('  manifesto.json               seções, cabeçalho e avisos da extração');
console.log(`  questoes.json                ${questoes.length} questões com todos os campos`);
if (temClassificacao) console.log('  classificacao-sugerida.csv   Área/Subárea/Semana/Módulo por questão');
else console.log('  (sem classificacao-sugerida.csv — este relatório não traz "Filtros da questão")');
console.log(`\npróximo: node ${join(import.meta.dirname, 'validar.mjs')} ${dir}`);

// Ecoa uma questão de cada formato para conferência visual imediata — barato e
// pega parser desalinhado antes de gastar tempo nas outras etapas.
const amostras = [...new Set([questoes[0], fechadas[0], abertas[0]].filter(Boolean))];
for (const amostra of amostras) {
  console.log(`\n── amostra: Q${amostra.numero} (${amostra.formato}) ──`);
  console.log(`fonte_original : ${amostra.fonte_original ?? '—'}`);
  console.log(`apoio          : ${colapsar(amostra.enunciado_apoio).slice(0, 90) || '—'}…`);
  console.log(`pergunta       : ${colapsar(amostra.enunciado).slice(0, 120)}…`);
  if (amostra.formato === 'aberta') {
    console.log(`resposta modelo: ${colapsar(amostra.resposta_modelo).slice(0, 90)}…`);
  } else {
    console.log(`alternativas   : ${Object.keys(amostra.alternativas).join(', ')}`);
    console.log(`gabarito       : ${(amostra.letra_correta ?? '—').toUpperCase()}`);
  }
}
