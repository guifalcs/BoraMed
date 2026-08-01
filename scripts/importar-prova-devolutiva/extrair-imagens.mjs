#!/usr/bin/env node
/**
 * Extrai para arquivo as imagens que **estão** embutidas no PDF.
 *
 * A Integradora 4 (2025.2) não tinha nenhuma: quando a questão original trazia
 * figura, o gerador do relatório a descartava, e a única saída era buscar na
 * fonte. A 2025.1 mostrou que isso não é regra — a questão 28 traz os dois
 * gráficos de crescimento embutidos na página 67, e o enunciado depende deles
 * ("Após colocar os dados antropométricos nos gráficos…").
 *
 * Só roda para questão com `imagem_embutida: true`. Questão sinalizada apenas por
 * menção no texto não tem o que extrair, e o relatório já diz isso.
 *
 * Uso:
 *   node extrair-imagens.mjs <dir-trabalho>
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/relatorio.mjs';
import { similaridadeVocabulario } from './lib/texto.mjs';

const alvo = process.argv[2];
if (!alvo) {
  console.error('uso: node extrair-imagens.mjs <dir-trabalho>');
  process.exit(2);
}
const dir = resolve(alvo);

const validacao = lerJson(join(dir, 'validacao.json'));
const manifesto = lerJson(join(dir, 'manifesto.json'));
if (!validacao || !manifesto) {
  console.error(`validacao.json/manifesto.json não encontrados em ${dir} — rode extrair.mjs e validar.mjs`);
  process.exit(2);
}

// O PDF é recolhido para o diretório de trabalho por `limpar.mjs --raiz`, então
// pode estar nos dois lugares.
const RAIZ = resolve(join(import.meta.dirname, '..', '..'));
const pdf = [join(dir, manifesto.pdf), join(RAIZ, manifesto.pdf)].find((c) => existsSync(c));
if (!pdf) {
  console.error(`PDF "${manifesto.pdf}" não encontrado nem em ${dir} nem em ${RAIZ}`);
  process.exit(2);
}

const comRaster = validacao.questoes.filter((q) => q.imagem_embutida);
if (comRaster.length === 0) {
  console.log('Nenhuma questão com imagem embutida no PDF.');
  const soMencao = validacao.questoes.filter((q) => q.tem_imagem);
  if (soMencao.length > 0) {
    console.log('');
    console.log(`${soMencao.length} questão(ões) sinalizada(s) só por menção no texto — a figura não`);
    console.log('está no PDF e precisa vir da fonte original. Veja saida/PENDENCIAS.md.');
  }
  process.exit(0);
}

const destino = join(dir, 'saida', 'imagens');
mkdirSync(destino, { recursive: true });

/** Assinaturas de imagem que se repetem entre páginas: logo, marca, template. */
const TEMPLATE = new Set(
  (manifesto.imagens_descartadas ?? [])
    .filter((i) => i.motivo === 'template')
    .map((i) => `${i.largura}x${i.altura}`),
);

/** `pdfimages -list` de uma página, só as entradas do tipo `image`. */
function listar(pagina) {
  const saida = execFileSync(
    'pdfimages',
    ['-list', '-f', String(pagina), '-l', String(pagina), pdf],
    { encoding: 'utf-8' },
  );
  return saida
    .split('\n')
    .slice(2)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    // O índice conta **todas** as entradas da página, inclusive `smask`, porque é
    // isso que numera os arquivos que o `pdfimages` escreve.
    .map((c, indice) => ({ indice, tipo: c[2], largura: +c[3] || 0, altura: +c[4] || 0 }))
    .filter((i) => i.tipo === 'image');
}

/** Todo o texto de uma questão, para comparar com o OCR da imagem. */
function textoDaQuestao(q) {
  return [
    q.enunciado_apoio,
    q.enunciado,
    ...Object.values(q.alternativas ?? {}),
    q.explicacao,
  ].filter(Boolean).join(' ');
}

/**
 * Desempata a dona de uma imagem por OCR.
 *
 * Só é chamada quando a página é dividida por duas questões, e aí não há sinal
 * determinístico: o `pdfimages` não informa a posição vertical da imagem, e sem
 * `mutool`/`qpdf` não há como inspecionar o operador de desenho. Comparar o texto
 * da imagem com o texto de cada candidata resolve — a tabela "Taxas de falha dos
 * contraceptivos" casa com a questão sobre anticoncepção e não com a questão
 * sobre fases do parto.
 *
 * Degrada com elegância: sem `tesseract` instalado, devolve `null` e a imagem
 * fica marcada como ambígua em vez de ser atribuída no chute.
 */
function donaPorOcr(caminho, candidatas) {
  let texto;
  try {
    texto = execFileSync('tesseract', [caminho, '-', '-l', 'por'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  if (!texto || texto.trim().length < 15) return null;

  const escores = candidatas
    .map((q) => ({ numero: q.numero, escore: similaridadeVocabulario(texto, textoDaQuestao(q)) }))
    .sort((a, b) => b.escore - a.escore);

  const [melhor, segundo] = escores;
  // Exige margem: OCR de tabela casa um pouco com qualquer texto médico.
  if (!melhor || melhor.escore < 0.2) return null;
  if (segundo && melhor.escore - segundo.escore < 0.1) return null;
  return { ...melhor, escores };
}

// ──── Extração: uma vez por imagem, não uma vez por questão candidata ────

const porPagina = new Map();
for (const q of comRaster) {
  for (const pagina of q.paginas_com_imagem ?? q.paginas) {
    if (!porPagina.has(pagina)) porPagina.set(pagina, []);
    porPagina.get(pagina).push(q);
  }
}

const escritos = [];
const contadorPorQuestao = new Map();

for (const [pagina, candidatas] of [...porPagina.entries()].sort((a, b) => a[0] - b[0])) {
  const imagens = listar(pagina).filter((i) => !TEMPLATE.has(`${i.largura}x${i.altura}`));
  if (imagens.length === 0) continue;

  const tmp = mkdtempSync(join(tmpdir(), 'devolutiva-img-'));
  try {
    execFileSync('pdfimages', ['-j', '-f', String(pagina), '-l', String(pagina), pdf, join(tmp, 'p')]);
    const arquivos = readdirSync(tmp).sort();

    for (const img of imagens) {
      const sufixo = String(img.indice).padStart(3, '0');
      const arquivo = arquivos.find((f) => f.startsWith(`p-${sufixo}`) || f.startsWith(`p${sufixo}`));
      if (!arquivo) continue;

      const origem = join(tmp, arquivo);

      // Grava primeiro com nome provisório: o OCR precisa do arquivo em disco.
      const provisorio = join(destino, `.p${pagina}-${sufixo}.jpg`);
      if (/\.jpe?g$/i.test(arquivo)) {
        // Stream JPEG embutido: cópia sem recompressão, qualidade original.
        copyFileSync(origem, provisorio);
      } else {
        execFileSync('python3', [
          '-c',
          'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB")' +
          '.save(sys.argv[2],"JPEG",quality=95,subsampling=0)',
          origem,
          provisorio,
        ]);
      }

      let dona = candidatas[0];
      let comoDecidiu = 'única candidata na página';
      let escores = null;

      if (candidatas.length > 1) {
        const porOcr = donaPorOcr(provisorio, candidatas);
        if (porOcr) {
          dona = candidatas.find((q) => q.numero === porOcr.numero);
          comoDecidiu = `OCR (${porOcr.escores.map((e) => `Q${e.numero}:${e.escore}`).join(' ')})`;
          escores = porOcr.escores;
        } else {
          dona = null;
          comoDecidiu = 'AMBÍGUA — decida você';
        }
      }

      const base = dona
        ? `q${String(dona.numero).padStart(3, '0')}`
        : `pagina${String(pagina).padStart(3, '0')}`;
      const n = (contadorPorQuestao.get(base) ?? 0) + 1;
      contadorPorQuestao.set(base, n);

      const nome = `${base}-${n}.jpg`;
      renameSync(provisorio, join(destino, nome));

      escritos.push({
        nome,
        pagina,
        dona: dona?.numero ?? null,
        candidatas: candidatas.map((q) => q.numero),
        comoDecidiu,
        escores,
        dimensoes: `${img.largura}×${img.altura}`,
        kb: Math.round(statSync(join(destino, nome)).size / 1024),
      });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`${escritos.length} imagem(ns) extraída(s) em ${destino}\n`);
console.log('| arquivo | página | questão | dimensões | tamanho | como foi atribuída |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const e of escritos) {
  const q = e.dona ? `Q${String(e.dona).padStart(3, '0')}` : `? (Q${e.candidatas.join(' ou Q')})`;
  console.log(`| ${e.nome} | ${e.pagina} | ${q} | ${e.dimensoes} | ${e.kb} KB | ${e.comoDecidiu} |`);
}

const compartilhadas = escritos.filter((e) => e.candidatas.length > 1);
if (compartilhadas.length > 0) {
  console.log('');
  console.log('── Imagem em página dividida por duas questões ──');
  console.log('Uma questão termina no meio da página em que a seguinte começa, então a página');
  console.log('sozinha não diz de quem é a imagem. Confira cada uma abaixo antes de anexar:');
  for (const e of compartilhadas) {
    console.log('');
    console.log(`  ${e.nome} (p.${e.pagina}) — candidatas: Q${e.candidatas.join(', Q')}`);
    console.log(`    decisão: ${e.comoDecidiu}`);
  }
}

const ambiguas = escritos.filter((e) => !e.dona);
console.log('');
if (ambiguas.length > 0) {
  console.log(`${ambiguas.length} imagem(ns) sem dona definida — o arquivo saiu com nome de página.`);
  console.log('Abra e decida a qual questão pertence antes de anexar.');
} else {
  console.log('Confira cada arquivo antes de subir: o recorte é a imagem embutida inteira,');
  console.log('que pode incluir moldura ou legenda da página.');
}
console.log('');
console.log('Anexe em /admin/questoes na questão correspondente (o trecho de busca está');
console.log('em saida/PENDENCIAS.md).');
