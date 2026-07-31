#!/usr/bin/env node
/**
 * FASE 0 (variante) — Extração determinística quando a prova de TPI chega em
 * dois PDFs separados em vez de um só: a digitalização da prova de um aluno
 * (só scan, sem camada de texto) e o relatório de devolutiva comentada (só
 * texto, sem folha de gabarito oficial embutida).
 *
 * Mesma lógica de `extrair.mjs`, mas cada seção vem de um PDF diferente. Se
 * nenhuma folha de gabarito oficial for encontrada em nenhum dos dois PDFs,
 * a extração não falha — grava gabarito.json vazio e marca
 * `manifesto.gabarito_pendente: true`. A letra correta é derivada depois de
 * transcrever o scan, em `derivar-gabarito.mjs`, por comparação de texto
 * contra a devolutiva.
 *
 * Uso: node extrair-duas-fontes.mjs <prova-scan.pdf> <devolutiva.pdf> [--saida <dir>] [--forcar]
 */

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  paginasDeTexto,
  classificarPaginas,
  extrairGabarito,
  extrairDevolutiva,
  extrairImagemDaPagina,
} from './lib/pdf.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

function slug(nome) {
  return nome
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function args() {
  const argv = process.argv.slice(2);
  const pdfs = argv.filter((a) => !a.startsWith('--'));
  const i = argv.indexOf('--saida');
  const saida = i >= 0 ? argv[i + 1] : null;
  return { scanPdf: pdfs[0], devPdf: pdfs[1], saida, forcar: argv.includes('--forcar') };
}

function faixa(nums) {
  if (nums.length === 0) return '—';
  const partes = [];
  let ini = nums[0];
  let prev = nums[0];
  for (const n of nums.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    partes.push(ini === prev ? `${ini}` : `${ini}-${prev}`);
    ini = n;
    prev = n;
  }
  partes.push(ini === prev ? `${ini}` : `${ini}-${prev}`);
  return partes.join(', ');
}

const { scanPdf: scanArg, devPdf: devArg, saida: saidaArg, forcar } = args();

if (!scanArg || !devArg) {
  console.error('uso: node extrair-duas-fontes.mjs <prova-scan.pdf> <devolutiva.pdf> [--saida <dir>] [--forcar]');
  process.exit(2);
}

const scanPdf = resolve(scanArg);
const devPdf = resolve(devArg);
for (const p of [scanPdf, devPdf]) {
  if (!existsSync(p)) {
    console.error(`PDF não encontrado: ${p}`);
    process.exit(2);
  }
}

const dir = saidaArg
  ? resolve(saidaArg)
  : join(AQUI, '.trabalho', slug(basename(scanPdf)));

if (existsSync(dir) && !forcar) {
  console.error(`diretório de trabalho já existe: ${dir}`);
  console.error('use --forcar para sobrescrever a extração (transcrições existentes são preservadas)');
  process.exit(2);
}

console.log(`PDF scan       : ${scanPdf}`);
console.log(`PDF devolutiva : ${devPdf}`);
console.log(`Saída          : ${dir}\n`);

mkdirSync(dir, { recursive: true });
mkdirSync(join(dir, 'paginas'), { recursive: true });
mkdirSync(join(dir, 'transcricao', 'passe1'), { recursive: true });
mkdirSync(join(dir, 'transcricao', 'passe2'), { recursive: true });

const fatais = [];

// ──── 1. PDF de scan — só as páginas fotografadas interessam ────

const paginasScan = paginasDeTexto(scanPdf);
const secoesScan = classificarPaginas(paginasScan);

console.log(`PDF scan — páginas totais : ${paginasScan.length}`);
console.log(`  scan         : ${secoesScan.scan.length} (${faixa(secoesScan.scan)})`);
if (secoesScan.gabarito.length > 0) console.log(`  gabarito     : ${secoesScan.gabarito.length} (${faixa(secoesScan.gabarito)})`);
if (secoesScan.devolutiva.length > 0) console.log(`  devolutiva   : ${secoesScan.devolutiva.length} (${faixa(secoesScan.devolutiva)})`);
if (secoesScan.desconhecida.length > 0) {
  console.log(`  DESCONHECIDA : ${secoesScan.desconhecida.length} (${faixa(secoesScan.desconhecida)})`);
  fatais.push(`PDF scan: páginas não classificadas (${faixa(secoesScan.desconhecida)}) — inspecione antes de seguir`);
}
if (secoesScan.scan.length === 0) fatais.push('PDF scan: nenhuma página de scan identificada');

// ──── 2. PDF de devolutiva — gabarito oficial (se houver) + devolutiva ────

const paginasDev = paginasDeTexto(devPdf);
const secoesDev = classificarPaginas(paginasDev);

console.log(`\nPDF devolutiva — páginas totais : ${paginasDev.length}`);
console.log(`  gabarito     : ${secoesDev.gabarito.length} (${faixa(secoesDev.gabarito)})`);
console.log(`  devolutiva   : ${secoesDev.devolutiva.length} (${faixa(secoesDev.devolutiva)})`);
if (secoesDev.continuacao_devolutiva?.length > 0) {
  console.log(
    `    ↳ ${secoesDev.continuacao_devolutiva.length} de continuação, sem marcador ` +
    `(${faixa(secoesDev.continuacao_devolutiva)}) — absorvidas`,
  );
}
if (secoesDev.desconhecida.length > 0) {
  console.log(`  DESCONHECIDA : ${secoesDev.desconhecida.length} (${faixa(secoesDev.desconhecida)})`);
  fatais.push(`PDF devolutiva: páginas não classificadas (${faixa(secoesDev.desconhecida)}) — inspecione antes de seguir`);
}
if (secoesDev.devolutiva.length === 0) fatais.push('nenhuma página de devolutiva identificada em nenhum dos dois PDFs');

// ──── 3. Gabarito oficial — pode estar em qualquer um dos dois PDFs ────

const gab1 = extrairGabarito(paginasScan, secoesScan.gabarito);
const gab2 = extrairGabarito(paginasDev, secoesDev.gabarito);
const gabarito = { ...gab1.gabarito, ...gab2.gabarito };
const totalGabarito = Object.keys(gabarito).length;
const gabaritoPendente = totalGabarito === 0;

console.log(`\ngabarito: ${totalGabarito} questões${gabaritoPendente ? ' — NENHUMA folha oficial encontrada' : ''}`);
if (gabaritoPendente) {
  console.log(
    '  ⚠ sem folha de gabarito extraível em nenhum dos dois PDFs — a letra correta será',
  );
  console.log('    derivada depois da transcrição, comparando as alternativas com a devolutiva');
  console.log('    (rode derivar-gabarito.mjs após transcrever). Isso substitui uma fonte');
  console.log('    independente por uma derivada — revisão manual das flags é obrigatória.');
} else {
  [...gab1.erros, ...gab2.erros].forEach((e) => fatais.push(`gabarito — ${e}`));
}

// ──── 4. Devolutiva comentada ────

const { devolutiva, erros: errosDevolutiva } = extrairDevolutiva(paginasDev, secoesDev.devolutiva);
const totalDevolutiva = Object.keys(devolutiva).length;
console.log(`devolutiva: ${totalDevolutiva} questões`);
errosDevolutiva.forEach((e) => fatais.push(`devolutiva — ${e}`));

if (!gabaritoPendente) {
  const semDevolutiva = Object.keys(gabarito)
    .map(Number)
    .filter((n) => !devolutiva[String(n)])
    .sort((a, b) => a - b);
  if (semDevolutiva.length > 0) console.log(`  ⚠ sem devolutiva: ${semDevolutiva.join(', ')}`);
}

const vazias = Object.entries(devolutiva)
  .filter(([, d]) => d.bruto.trim().length < 80)
  .map(([n]) => n);
if (vazias.length > 0) console.log(`  ⚠ devolutiva muito curta (< 80 chars): ${vazias.join(', ')}`);

// ──── 5. Páginas do scan (imagens) ────

console.log('\nextraindo imagens do scan...');
const tmpDir = join(dir, '.tmp-imagens');
const indicePaginas = [];

for (const num of secoesScan.scan) {
  const destino = join(dir, 'paginas', `p${String(num).padStart(3, '0')}.jpg`);
  const info = extrairImagemDaPagina(scanPdf, num, destino, tmpDir);
  if (!info) {
    fatais.push(`página ${num}: nenhuma imagem extraível`);
    continue;
  }
  indicePaginas.push({
    pagina_pdf: num,
    arquivo: `paginas/p${String(num).padStart(3, '0')}.jpg`,
    largura: info.largura,
    altura: info.altura,
  });
  process.stdout.write(`\r  p${num} — ${info.largura}×${info.altura}   `);
}
rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n  ${indicePaginas.length} páginas extraídas`);

const baixaResolucao = indicePaginas.filter((p) => p.largura < 1200);
if (baixaResolucao.length > 0) {
  console.log(
    `  ⚠ baixa resolução (< 1200px de largura): ${baixaResolucao.map((p) => p.pagina_pdf).join(', ')}` +
    ' — transcrever com atenção extra',
  );
}

// ──── 6. Persistência ────

const manifesto = {
  pdf_scan: basename(scanPdf),
  pdf_devolutiva: basename(devPdf),
  extraido_em: new Date().toISOString(),
  paginas_scan_total: paginasScan.length,
  paginas_devolutiva_total: paginasDev.length,
  secoes_scan: secoesScan,
  secoes_devolutiva: secoesDev,
  total_questoes: gabaritoPendente ? totalDevolutiva : totalGabarito,
  paginas_scan: indicePaginas.length,
  gabarito_pendente: gabaritoPendente,
  avisos: {
    devolutiva_curta: vazias,
    baixa_resolucao: baixaResolucao.map((p) => p.pagina_pdf),
  },
};

const escrever = (nome, dados) =>
  writeFileSync(join(dir, nome), JSON.stringify(dados, null, 2) + '\n', 'utf-8');

escrever('manifesto.json', manifesto);
escrever('gabarito.json', gabarito);
escrever('devolutiva.json', devolutiva);
escrever('paginas/index.json', indicePaginas);

const linhasCsv = ['questao,area,subarea,tema'];
for (const n of Object.keys(devolutiva).map(Number).sort((a, b) => a - b)) {
  const c = devolutiva[String(n)].classificacao;
  if (!c.area && !c.subarea && !c.tema) continue;
  const esc = (v) => (v ? `"${v.replace(/"/g, '""')}"` : '');
  linhasCsv.push(`${n},${esc(c.area)},${esc(c.subarea)},${esc(c.tema)}`);
}
writeFileSync(join(dir, 'classificacao-sugerida.csv'), linhasCsv.join('\n') + '\n', 'utf-8');
console.log(`\nclassificação sugerida: ${linhasCsv.length - 1} questões com Área/Subárea/Tema`);

// ──── 7. Veredito ────

if (fatais.length > 0) {
  console.error('\n✗ EXTRAÇÃO COM PROBLEMAS — resolva antes de transcrever:');
  fatais.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
}

console.log(`\n✓ extração íntegra — ${totalDevolutiva} questões na devolutiva, ${indicePaginas.length} páginas para transcrever`);
if (gabaritoPendente) {
  console.log('  gabarito PENDENTE — rode derivar-gabarito.mjs depois da transcrição');
}
console.log(`\npróximo passo: transcrever as páginas do scan em`);
console.log(`  ${join(dir, 'transcricao', 'passe1')}  e  ${join(dir, 'transcricao', 'passe2')}`);
