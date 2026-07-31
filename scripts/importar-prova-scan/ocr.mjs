#!/usr/bin/env node
/**
 * OCR das páginas do scan — a segunda testemunha, de graça.
 *
 * Substitui o segundo passe de transcrição por IA. Duas razões, uma econômica e
 * uma técnica:
 *
 *  - Econômica: dois passes de IA custaram ~2,4M tokens nesta prova, dos quais
 *    ~80% era overhead de subagente. O OCR custa zero.
 *  - Técnica: dois passes do MESMO modelo erram de forma correlacionada — foi o
 *    risco que os testes do pipeline mediram de propósito. Um motor OCR clássico
 *    erra de forma completamente diferente de um LLM (confunde glifo parecido,
 *    não alucina frase plausível), então concordar com ele vale mais do que
 *    concordar com uma segunda rodada de si mesmo.
 *
 * O OCR desta prova não serve para diff estrito — página fotografada com skew
 * derruba a precisão de layout. Serve para **cobertura**: cada trecho que a IA
 * transcreveu tem que ter eco no texto do OCR da mesma página. Isso pega troca
 * de palavra e alucinação, que é o que importa.
 *
 * Pré-processa a imagem antes (escala de cinza + autocontraste) porque melhora
 * bastante o resultado em foto de papel.
 *
 * Uso: node scripts/importar-prova-scan/ocr.mjs <dir-trabalho> [--paginas 1,2,3]
 */

import { execFileSync, execFileSync as run } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/pdf.mjs';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('uso: node ocr.mjs <dir-trabalho> [--paginas 1,2,3]');
  process.exit(2);
}
const dir = resolve(dirArg);

const iPag = process.argv.indexOf('--paginas');
const filtro = iPag >= 0
  ? new Set(process.argv[iPag + 1].split(',').map((n) => parseInt(n.trim(), 10)))
  : null;

// ──── Dependências ────

try {
  run('tesseract', ['--version'], { stdio: 'pipe' });
} catch {
  console.error('tesseract não encontrado. Instale com:');
  console.error('  sudo apt install -y tesseract-ocr tesseract-ocr-por');
  process.exit(2);
}

const idiomas = run('tesseract', ['--list-langs'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
const lang = /^por$/m.test(idiomas) ? 'por' : 'eng';
if (lang === 'eng') {
  console.log('⚠ pacote de português não instalado (tesseract-ocr-por) — usando eng, qualidade cai');
}

const indicePaginas = lerJson(join(dir, 'paginas', 'index.json'));
if (!indicePaginas) {
  console.error(`paginas/index.json não encontrado em ${dir} — rode extrair.mjs primeiro`);
  process.exit(2);
}

const alvo = indicePaginas.filter((p) => !filtro || filtro.has(p.pagina_pdf));
if (alvo.length === 0) {
  console.error('nenhuma página selecionada');
  process.exit(2);
}

const dirOcr = join(dir, 'ocr');
mkdirSync(dirOcr, { recursive: true });
const tmp = join(dir, '.tmp-ocr');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// Pré-processamento: cinza + autocontraste. Binarização agressiva piora em foto
// com iluminação irregular, então deixa-se o threshold para o próprio tesseract.
const PREPARO = `
import sys
from PIL import Image, ImageOps
img = Image.open(sys.argv[1]).convert("L")
img = ImageOps.autocontrast(img, cutoff=1)
# Amplia se a página vier em baixa resolução: o tesseract precisa de ~300dpi
# equivalentes, e algumas páginas desta prova têm só 656px de largura.
if img.width < 1600:
    fator = 1600 / img.width
    img = img.resize((int(img.width * fator), int(img.height * fator)), Image.LANCZOS)
img.save(sys.argv[2], "PNG")
`;

console.log(`OCR de ${alvo.length} páginas (idioma: ${lang})...`);

let ok = 0;
const vazias = [];

for (const p of alvo) {
  const origem = join(dir, p.arquivo);
  if (!existsSync(origem)) {
    console.log(`  ✗ p${p.pagina_pdf}: imagem ausente`);
    continue;
  }
  const preparada = join(tmp, `p${p.pagina_pdf}.png`);
  const saidaBase = join(tmp, `p${p.pagina_pdf}-ocr`);

  try {
    execFileSync('python3', ['-c', PREPARO, origem, preparada]);
    // --psm 6: bloco único de texto. Prova é coluna única; psm 3 (automático)
    // tende a embaralhar a ordem quando há figura no meio.
    execFileSync('tesseract', [preparada, saidaBase, '-l', lang, '--psm', '6'], { stdio: 'pipe' });
  } catch (e) {
    console.log(`  ✗ p${p.pagina_pdf}: ${String(e.message).split('\n')[0]}`);
    continue;
  }

  const texto = readFileSync(`${saidaBase}.txt`, 'utf-8');
  const destino = join(dirOcr, `p${String(p.pagina_pdf).padStart(3, '0')}.txt`);
  writeFileSync(destino, texto, 'utf-8');

  const chars = texto.replace(/\s/g, '').length;
  if (chars < 200) vazias.push(p.pagina_pdf);
  ok += 1;
  process.stdout.write(`\r  p${p.pagina_pdf}: ${chars} chars        `);
}

rmSync(tmp, { recursive: true, force: true });

console.log(`\n\n${ok} páginas com OCR em ${dirOcr}`);
if (vazias.length > 0) {
  console.log(`⚠ pouco texto reconhecido em: ${vazias.join(', ')} — nessas o OCR não serve de testemunha`);
}
console.log('\npróximo passo: node validar.mjs <dir> (usa o OCR automaticamente)');
