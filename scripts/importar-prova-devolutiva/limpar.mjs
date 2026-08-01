#!/usr/bin/env node
/**
 * Limpeza do diretório de trabalho.
 *
 * Bem menos agressiva que a do TPI, porque aqui não existe o intermediário caro:
 * sem scan, sem OCR, sem recorte de zoom. O que se remove é o PDF de entrada
 * (que tem nome de aluno no cabeçalho) recolhido para fora da raiz, e nada mais.
 *
 * Uso:
 *   node limpar.mjs <dir-trabalho> [--raiz] [--seco] [--tudo]
 *
 *   --raiz  recolhe para o diretório de trabalho o PDF de entrada e o
 *           questoes-revisadas.json que ficaram soltos na raiz do projeto
 *   --seco  só mostra o que faria
 *   --tudo  apaga o diretório de trabalho inteiro
 */

import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { lerJson } from './lib/relatorio.mjs';

const args = process.argv.slice(2);
const alvo = args.find((a) => !a.startsWith('--'));
const seco = args.includes('--seco');
const tudo = args.includes('--tudo');
const raiz = args.includes('--raiz');

if (!alvo) {
  console.error('uso: node limpar.mjs <dir-trabalho> [--raiz] [--seco] [--tudo]');
  process.exit(2);
}

const dir = resolve(alvo);
if (!existsSync(dir)) {
  console.error(`diretório não encontrado: ${dir}`);
  process.exit(2);
}

const RAIZ_PROJETO = resolve(join(import.meta.dirname, '..', '..'));

function tamanho(caminho) {
  if (!existsSync(caminho)) return 0;
  const s = statSync(caminho);
  if (!s.isDirectory()) return s.size;
  return readdirSync(caminho).reduce((total, f) => total + tamanho(join(caminho, f)), 0);
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

if (tudo) {
  const t = tamanho(dir);
  console.log(`${seco ? '[seco] ' : ''}apagar ${dir} (${mb(t)})`);
  if (!seco) rmSync(dir, { recursive: true, force: true });
  console.log(seco ? 'nada foi removido' : 'removido');
  process.exit(0);
}

// ──── Recolher o que ficou na raiz ────

if (raiz) {
  const manifesto = lerJson(join(dir, 'manifesto.json'));
  const candidatos = [
    manifesto?.pdf ? join(RAIZ_PROJETO, manifesto.pdf) : null,
    join(RAIZ_PROJETO, 'questoes-revisadas.json'),
  ].filter((c) => c && existsSync(c));

  for (const origem of candidatos) {
    const destino = join(dir, basename(origem));
    if (existsSync(destino)) {
      console.log(`${seco ? '[seco] ' : ''}${basename(origem)} já está no diretório de trabalho — remover da raiz`);
      if (!seco) rmSync(origem, { force: true });
      continue;
    }
    console.log(`${seco ? '[seco] ' : ''}mover ${basename(origem)} → ${dir}`);
    if (!seco) renameSync(origem, destino);
  }
  if (candidatos.length === 0) console.log('nada solto na raiz do projeto');
}

// ──── O que fica ────

console.log('');
console.log('preservado como registro da importação:');
for (const f of ['manifesto.json', 'questoes.json', 'validacao.json', 'relatorio-validacao.md', 'classificacao-sugerida.csv', 'questoes-revisadas.json', 'saida']) {
  const caminho = join(dir, f);
  if (existsSync(caminho)) console.log(`  ${f.padEnd(28)} ${mb(tamanho(caminho))}`);
}
console.log('');
console.log(`total: ${mb(tamanho(dir))} em ${dir}`);
console.log('');
console.log('Use --tudo quando a prova já estiver importada e conferida no admin.');
console.log('Confirme `git status --short` limpo antes de fechar.');
