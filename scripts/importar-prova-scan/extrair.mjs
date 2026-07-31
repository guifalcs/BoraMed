#!/usr/bin/env node
/**
 * FASE 0 — Extração determinística (zero IA).
 *
 * Separa o PDF nas suas três naturezas e extrai tudo o que já é texto:
 *   - gabarito oficial  → gabarito.json      (fidelidade absoluta)
 *   - devolutiva        → devolutiva.json    (fidelidade absoluta)
 *   - páginas do scan   → paginas/pNNN.jpg   (JPEG nativo, sem recompressão)
 *
 * Uso: node scripts/importar-prova-scan/extrair.mjs <prova.pdf> [--saida <dir>]
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
  const pdf = argv.find((a) => !a.startsWith('--'));
  const i = argv.indexOf('--saida');
  const saida = i >= 0 ? argv[i + 1] : null;
  return { pdf, saida, forcar: argv.includes('--forcar') };
}

const { pdf: pdfArg, saida: saidaArg, forcar } = args();

if (!pdfArg) {
  console.error('uso: node extrair.mjs <prova.pdf> [--saida <dir>] [--forcar]');
  process.exit(2);
}

const pdf = resolve(pdfArg);
if (!existsSync(pdf)) {
  console.error(`PDF não encontrado: ${pdf}`);
  process.exit(2);
}

const dir = saidaArg
  ? resolve(saidaArg)
  : join(AQUI, '.trabalho', slug(basename(pdf)));

if (existsSync(dir) && !forcar) {
  console.error(`diretório de trabalho já existe: ${dir}`);
  console.error('use --forcar para sobrescrever a extração (transcrições existentes são preservadas)');
  process.exit(2);
}

console.log(`PDF   : ${pdf}`);
console.log(`Saída : ${dir}\n`);

mkdirSync(dir, { recursive: true });
mkdirSync(join(dir, 'paginas'), { recursive: true });
mkdirSync(join(dir, 'transcricao', 'passe1'), { recursive: true });
mkdirSync(join(dir, 'transcricao', 'passe2'), { recursive: true });

// ──── 1. Texto e classificação das páginas ────

const paginas = paginasDeTexto(pdf);
const secoes = classificarPaginas(paginas);

console.log(`páginas totais : ${paginas.length}`);
console.log(`  scan         : ${secoes.scan.length} (${faixa(secoes.scan)})`);
console.log(`  gabarito     : ${secoes.gabarito.length} (${faixa(secoes.gabarito)})`);
console.log(`  devolutiva   : ${secoes.devolutiva.length} (${faixa(secoes.devolutiva)})`);
if (secoes.continuacao_devolutiva?.length > 0) {
  console.log(
    `    ↳ ${secoes.continuacao_devolutiva.length} de continuação, sem marcador ` +
    `(${faixa(secoes.continuacao_devolutiva)}) — absorvidas`,
  );
}
if (secoes.desconhecida.length > 0) {
  console.log(`  DESCONHECIDA : ${secoes.desconhecida.length} (${faixa(secoes.desconhecida)})`);
}

const fatais = [];
if (secoes.gabarito.length === 0) fatais.push('nenhuma folha de gabarito identificada');
if (secoes.devolutiva.length === 0) fatais.push('nenhuma página de devolutiva identificada');
if (secoes.scan.length === 0) fatais.push('nenhuma página de scan identificada');
if (secoes.desconhecida.length > 0) {
  fatais.push(
    `páginas não classificadas (${faixa(secoes.desconhecida)}) — têm camada de texto mas não são ` +
    'gabarito nem devolutiva; inspecione antes de seguir',
  );
}

// ──── 2. Gabarito oficial ────

const { gabarito, erros: errosGabarito } = extrairGabarito(paginas, secoes.gabarito);
const totalGabarito = Object.keys(gabarito).length;
console.log(`\ngabarito: ${totalGabarito} questões`);
errosGabarito.forEach((e) => fatais.push(`gabarito — ${e}`));

// ──── 3. Devolutiva comentada ────

const { devolutiva, erros: errosDevolutiva } = extrairDevolutiva(paginas, secoes.devolutiva);
const totalDevolutiva = Object.keys(devolutiva).length;
console.log(`devolutiva: ${totalDevolutiva} questões`);
errosDevolutiva.forEach((e) => fatais.push(`devolutiva — ${e}`));

const semDevolutiva = Object.keys(gabarito)
  .map(Number)
  .filter((n) => !devolutiva[String(n)])
  .sort((a, b) => a - b);
if (semDevolutiva.length > 0) {
  console.log(`  ⚠ sem devolutiva: ${semDevolutiva.join(', ')}`);
}

const vazias = Object.entries(devolutiva)
  .filter(([, d]) => d.bruto.trim().length < 80)
  .map(([n]) => n);
if (vazias.length > 0) {
  console.log(`  ⚠ devolutiva muito curta (< 80 chars): ${vazias.join(', ')}`);
}

// ──── 4. Páginas do scan ────

console.log('\nextraindo imagens do scan...');
const tmpDir = join(dir, '.tmp-imagens');
const indicePaginas = [];

for (const num of secoes.scan) {
  const destino = join(dir, 'paginas', `p${String(num).padStart(3, '0')}.jpg`);
  const info = extrairImagemDaPagina(pdf, num, destino, tmpDir);
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

// ──── 5. Persistência ────

const manifesto = {
  pdf: basename(pdf),
  extraido_em: new Date().toISOString(),
  paginas_total: paginas.length,
  secoes,
  total_questoes: totalGabarito,
  paginas_scan: indicePaginas.length,
  avisos: {
    sem_devolutiva: semDevolutiva,
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

// Sugestão de classificação — só quando a devolutiva traz Área/Subárea/Tema.
const linhasCsv = ['questao,area,subarea,tema'];
for (const n of Object.keys(devolutiva).map(Number).sort((a, b) => a - b)) {
  const c = devolutiva[String(n)].classificacao;
  if (!c.area && !c.subarea && !c.tema) continue;
  const esc = (v) => (v ? `"${v.replace(/"/g, '""')}"` : '');
  linhasCsv.push(`${n},${esc(c.area)},${esc(c.subarea)},${esc(c.tema)}`);
}
writeFileSync(join(dir, 'classificacao-sugerida.csv'), linhasCsv.join('\n') + '\n', 'utf-8');
console.log(`\nclassificação sugerida: ${linhasCsv.length - 1} questões com Área/Subárea/Tema`);

// ──── 6. Veredito ────

if (fatais.length > 0) {
  console.error('\n✗ EXTRAÇÃO COM PROBLEMAS — resolva antes de transcrever:');
  fatais.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
}

console.log(`\n✓ extração íntegra — ${totalGabarito} questões, ${indicePaginas.length} páginas para transcrever`);
console.log(`\npróximo passo: transcrever as páginas do scan em`);
console.log(`  ${join(dir, 'transcricao', 'passe1')}  e  ${join(dir, 'transcricao', 'passe2')}`);

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
