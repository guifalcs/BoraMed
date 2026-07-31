#!/usr/bin/env node
/**
 * FASE 5 — Round-trip contra o parser real do admin.
 *
 * Última rede antes de colar em produção: transpila
 * `admin-importar.component.ts` e roda o `parseBlocos()` de verdade contra o
 * markdown gerado, conferindo campo por campo que nada se perdeu nem mudou.
 *
 * Existe porque o parser detecta campos por prefixo de linha case-insensitive,
 * e conteúdo de prova tem linhas assim de verdade. Sem blindagem, uma legenda
 * "Fonte: Federação Internacional..." no texto de apoio é consumida como o
 * campo FONTE e desaparece; uma linha "Gabarito: A alternativa correta..." na
 * explicação inverte o gabarito. `gerar.mjs` neutraliza os dois — este script
 * prova que neutralizou.
 *
 * Uso: node scripts/importar-prova-scan/verificar-roundtrip.mjs <dir-trabalho>
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const COMPONENTE = join(RAIZ, 'frontend/src/app/(admin)/importar/admin-importar.component.ts');

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('uso: node verificar-roundtrip.mjs <dir-trabalho>');
  process.exit(2);
}
const dir = resolve(dirArg);
const md = join(dir, 'saida', 'prova.md');

for (const [rotulo, caminho] of [['markdown', md], ['componente do admin', COMPONENTE]]) {
  if (!existsSync(caminho)) {
    console.error(`${rotulo} não encontrado: ${caminho}`);
    process.exit(2);
  }
}

// ──── Carrega o parser real ────
// O componente é Angular; recorta-se tudo a partir do decorator @Component e
// removem-se os imports, sobrando os tipos e as funções puras de parsing.

const require = createRequire(join(RAIZ, 'frontend/'));
let ts;
try {
  ts = require('typescript');
} catch {
  console.error('typescript não encontrado em frontend/node_modules — rode `npm ci` no frontend');
  process.exit(2);
}

const src = readFileSync(COMPONENTE, 'utf-8');
const corte = src.indexOf('@Component(');
if (corte < 0) {
  console.error('não achei o decorator @Component — o componente mudou de forma, ajuste este script');
  process.exit(2);
}
const puro = src.slice(0, corte).replace(/^import[\s\S]*?from\s+'[^']*';\s*$/gm, '');
const js = ts.transpileModule(puro, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const tmp = join(mkdtempSync(join(tmpdir(), 'parser-admin-')), 'parser.mjs');
writeFileSync(tmp, js, 'utf-8');
const { parseBlocos } = await import(tmp);
if (typeof parseBlocos !== 'function') {
  console.error('parseBlocos não exportado pelo componente — ajuste este script');
  process.exit(2);
}

// ──── Compara o que o parser leu com o que devia ter lido ────

const validacao = JSON.parse(readFileSync(join(dir, 'validacao.json'), 'utf-8'));
const revisadas = existsSync(join(dir, 'questoes-revisadas.json'))
  ? JSON.parse(readFileSync(join(dir, 'questoes-revisadas.json'), 'utf-8'))
  : {};

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const esperado = (numero, campo) => {
  const orig = validacao.questoes.find((x) => x.numero === numero);
  const rev = revisadas[String(numero)] ?? {};
  if (campo === 'alternativas') return { ...(orig?.alternativas ?? {}), ...(rev.alternativas ?? {}) };
  return rev[campo] ?? orig?.[campo] ?? '';
};

const parsed = parseBlocos(readFileSync(md, 'utf-8'), [], []);
const falhas = [];
const avisos = [];

console.log(`blocos lidos pelo parser do admin: ${parsed.length}`);
console.log(`  válidos   : ${parsed.filter((q) => q.valida).length}`);
console.log(`  inválidos : ${parsed.filter((q) => !q.valida).length}`);
console.log('');

parsed.forEach((q, i) => {
  if (!q.valida) falhas.push(`bloco ${i + 1}: parser rejeitou — ${q.erros.join('; ')}`);

  const numero = Number(q.fonte?.match(/Q(\d+)/)?.[1]);
  if (!numero) {
    falhas.push(`bloco ${i + 1}: FONTE não sobreviveu ao parser ("${q.fonte ?? ''}") — número da questão perdido`);
    return;
  }

  const orig = validacao.questoes.find((x) => x.numero === numero);
  if (!orig) {
    falhas.push(`Q${numero}: bloco no markdown sem questão correspondente na validação`);
    return;
  }

  const gabLido = q.alternativas.find((a) => a.correta)?.letra;
  if (gabLido !== orig.letra_oficial) {
    falhas.push(`Q${numero}: GABARITO virou ${gabLido ?? '—'}, oficial é ${orig.letra_oficial}`);
  }

  if (norm(q.enunciado) !== norm(esperado(numero, 'enunciado'))) {
    falhas.push(`Q${numero}: ENUNCIADO alterado pelo parser`);
  }
  if (norm(q.enunciado_apoio) !== norm(esperado(numero, 'enunciado_apoio'))) {
    falhas.push(
      `Q${numero}: ENUNCIADO_APOIO alterado — esperado ${norm(esperado(numero, 'enunciado_apoio')).length} chars, ` +
      `lido ${norm(q.enunciado_apoio).length}`,
    );
  }

  const alts = esperado(numero, 'alternativas');
  if (q.alternativas.length !== Object.keys(alts).length) {
    falhas.push(`Q${numero}: ${q.alternativas.length} alternativas lidas, ${Object.keys(alts).length} esperadas`);
  }
  for (const [letra, texto] of Object.entries(alts)) {
    const lida = q.alternativas.find((a) => a.letra === letra.toUpperCase())?.texto;
    if (norm(lida) !== norm(texto)) {
      falhas.push(`Q${numero} alternativa ${letra}: texto alterado pelo parser`);
    }
  }

  if (orig.explicacao && !norm(q.explicacao)) falhas.push(`Q${numero}: EXPLICACAO sumiu`);
  if (orig.referencia && !norm(q.referencia)) falhas.push(`Q${numero}: REFERENCIA sumiu`);
  if (q.tipo_questao === null) avisos.push(`Q${numero}: TIPO não reconhecido`);
});

const numerosMd = new Set(parsed.map((q) => Number(q.fonte?.match(/Q(\d+)/)?.[1])).filter(Boolean));
const duplicados = parsed.length - numerosMd.size;
if (duplicados > 0) falhas.push(`${duplicados} questão(ões) duplicada(s) no markdown`);

if (avisos.length > 0) {
  console.log('avisos:');
  avisos.slice(0, 10).forEach((a) => console.log(`  · ${a}`));
  console.log('');
}

if (falhas.length > 0) {
  console.error(`✗ ${falhas.length} falha(s) de round-trip:`);
  falhas.slice(0, 40).forEach((f) => console.error(`  • ${f}`));
  if (falhas.length > 40) console.error(`  … (+${falhas.length - 40})`);
  console.error('\nNÃO cole esse markdown no admin — corrija gerar.mjs antes.');
  process.exit(1);
}

console.log(`✓ round-trip íntegro — as ${parsed.length} questões atravessam o parser do admin sem perda nem alteração`);
