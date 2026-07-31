#!/usr/bin/env node
/**
 * Limpeza pós-importação.
 *
 * O pipeline produz muito material intermediário — scans das páginas, OCR,
 * recortes de zoom, transcrições. Nada disso é versionado (`.trabalho/` está no
 * `.gitignore`), mas ocupa disco e, principalmente, arquivos escapam para a raiz
 * do projeto no caminho: o `questoes-revisadas.json` baixado pelo navegador vai
 * para onde o usuário salvar, e o PDF da prova fica na raiz.
 *
 * Por padrão remove só o intermediário e preserva o que tem valor de auditoria
 * (markdown gerado, validação, gabarito, devolutiva, revisão manual).
 *
 * Uso:
 *   node scripts/importar-prova-scan/limpar.mjs <dir-trabalho> [opções]
 *
 * Opções:
 *   --tudo       remove o diretório de trabalho inteiro
 *   --raiz       move para o diretório de trabalho os arquivos do pipeline que
 *                estiverem soltos na raiz do projeto (e o PDF de entrada)
 *   --seco       só lista o que faria, sem apagar nada
 */

import { existsSync, rmSync, statSync, readdirSync, renameSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');

const argv = process.argv.slice(2);
const dirArg = argv.find((a) => !a.startsWith('--'));
const TUDO = argv.includes('--tudo');
const RAIZ_TB = argv.includes('--raiz');
const SECO = argv.includes('--seco');

if (!dirArg) {
  console.error('uso: node limpar.mjs <dir-trabalho> [--tudo] [--raiz] [--seco]');
  process.exit(2);
}
const dir = resolve(dirArg);
if (!existsSync(dir)) {
  console.error(`diretório de trabalho não encontrado: ${dir}`);
  process.exit(2);
}

/** Tamanho em disco de um caminho, recursivo. */
function tamanho(caminho) {
  if (!existsSync(caminho)) return 0;
  const st = statSync(caminho);
  if (!st.isDirectory()) return st.size;
  return readdirSync(caminho).reduce((a, f) => a + tamanho(join(caminho, f)), 0);
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

// ──── Intermediário: reprodutível a partir do PDF, sem valor de auditoria ────

const INTERMEDIARIO = [
  ['paginas', 'imagens das páginas do scan — reextraíveis do PDF'],
  ['ocr', 'texto do OCR — regerável com ocr.mjs'],
  ['lacunas', 'recortes de zoom e resoluções — regeráveis'],
  ['.tmp-imagens', 'temporário'],
  ['.tmp-ocr', 'temporário'],
  // Sem `paginas/` o HTML de revisão fica com todas as imagens quebradas, então
  // guardá-lo seria guardar um arquivo inútil. Regerável com revisao.mjs.
  ['revisao.html', 'tela de revisão — depende de paginas/, regerável com revisao.mjs'],
];

/** Preservado: barato em disco e é o registro do que foi importado. */
const PRESERVADO = [
  'saida', 'validacao.json', 'relatorio-validacao.md', 'gabarito.json',
  'devolutiva.json', 'manifesto.json', 'questoes-revisadas.json',
  'classificacao-sugerida.csv', 'transcricao',
];

console.log(`diretório: ${dir}`);
console.log(`tamanho atual: ${mb(tamanho(dir))}\n`);

if (TUDO) {
  console.log(`${SECO ? '[seco] ' : ''}remover o diretório INTEIRO — ${mb(tamanho(dir))}`);
  console.log('  (inclui o markdown gerado e o registro de validação)');
  if (!SECO) rmSync(dir, { recursive: true, force: true });
} else {
  let liberado = 0;
  for (const [nome, motivo] of INTERMEDIARIO) {
    const alvo = join(dir, nome);
    if (!existsSync(alvo)) continue;
    const t = tamanho(alvo);
    liberado += t;
    console.log(`${SECO ? '[seco] ' : ''}remover ${nome.padEnd(14)} ${mb(t).padStart(9)}  — ${motivo}`);
    if (!SECO) rmSync(alvo, { recursive: true, force: true });
  }
  console.log(`\n${SECO ? 'liberaria' : 'liberado'}: ${mb(liberado)}`);
  console.log(`preservado: ${PRESERVADO.filter((p) => existsSync(join(dir, p))).join(', ')}`);
}

// ──── Arquivos do pipeline soltos na raiz do projeto ────

if (RAIZ_TB) {
  console.log('\n── arquivos soltos na raiz ──');
  const destino = TUDO ? join(RAIZ, 'scripts/importar-prova-scan/.trabalho') : dir;
  if (!SECO) mkdirSync(destino, { recursive: true });

  const soltos = readdirSync(RAIZ).filter(
    (f) => /^questoes-revisadas.*\.json$/.test(f) || /\.pdf$/i.test(f),
  );

  if (soltos.length === 0) {
    console.log('  nenhum');
  } else {
    for (const f of soltos) {
      const de = join(RAIZ, f);
      const para = join(destino, basename(f));
      console.log(`${SECO ? '[seco] ' : ''}mover ${f}  →  ${para.replace(RAIZ + '/', '')}`);
      if (!SECO && de !== para) {
        try {
          renameSync(de, para);
        } catch {
          console.log(`  ✗ falhou ao mover ${f} (mova à mão)`);
        }
      }
    }
  }
}

// ──── Estado do git ────

console.log('\n── árvore git ──');
console.log('`.trabalho/` e PDFs na raiz estão no .gitignore, então o intermediário');
console.log('nunca entra no versionamento. O que escapa é arquivo do pipeline salvo');
console.log('fora dele — use --raiz para recolher.');
console.log('\nConfira com:  git status --short');
