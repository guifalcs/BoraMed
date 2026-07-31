#!/usr/bin/env node
/**
 * FASE 1 — Extração determinística do relatório de devolutiva da Integradora.
 *
 * O PDF é gerado, não digitalizado: camada de texto em todas as páginas e a
 * resposta certa marcada em linha (`(alternativa C) (CORRETA)`). Não há nada
 * aqui que precise de IA — enunciado, alternativas, gabarito, explicação,
 * referências e classificação saem por regex do próprio PDF.
 *
 * Uso:
 *   node extrair.mjs "Integradora 4 - (2025.2).pdf"
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
// perda silenciosa, o pior modo de falha possível. Foi assim que a questão 7
// desta prova ficou sem nenhuma alternativa antes de os rótulos passarem a casar
// com sensibilidade à caixa. Bloqueia em vez de gerar markdown mutilado.
const mutiladas = questoes.filter(
  (q) => !q.enunciado.trim() || Object.keys(q.alternativas).length < 2,
);
for (const q of mutiladas) {
  const faltando = [
    !q.enunciado.trim() && 'enunciado',
    Object.keys(q.alternativas).length < 2 && `alternativas (${Object.keys(q.alternativas).length})`,
  ].filter(Boolean);
  bloqueios.push(`Q${q.numero} (p.${q.paginas.join(',')}): sem ${faltando.join(' e ')}`);
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

// ──── Resumo ────

const semGabarito = questoes.filter((q) => !q.letra_correta);
const comImagem = questoes.filter((q) => q.tem_imagem);
const comTabela = questoes.filter((q) => q.tem_tabela);
const porDivisao = (c) => questoes.filter((q) => q.divisao === c).length;

console.log(`\nquestões        : ${questoes.length}`);
console.log(`cabeçalho       : ${cabecalho.titulo ?? '(não identificado)'}`);
console.log(`  componente    : ${cabecalho.componente ?? '—'}   data: ${cabecalho.data ?? '—'}`);
console.log(`gabarito inline : ${questoes.length - semGabarito.length}/${questoes.length} com (CORRETA) única`);
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
console.log('  classificacao-sugerida.csv   Área/Subárea/Semana/Módulo por questão');
console.log(`\npróximo: node ${join(import.meta.dirname, 'validar.mjs')} ${dir}`);

// Ecoa uma questão para conferência visual imediata — barato e pega parser
// desalinhado antes de gastar tempo nas outras etapas.
const amostra = questoes[0];
if (amostra) {
  console.log('\n── amostra: Q1 ──');
  console.log(`fonte_original : ${amostra.fonte_original ?? '—'}`);
  console.log(`apoio          : ${colapsar(amostra.enunciado_apoio).slice(0, 90) || '—'}…`);
  console.log(`pergunta       : ${colapsar(amostra.enunciado).slice(0, 90)}…`);
  console.log(`alternativas   : ${Object.keys(amostra.alternativas).join(', ')}`);
  console.log(`gabarito       : ${(amostra.letra_correta ?? '—').toUpperCase()}`);
}
