#!/usr/bin/env node
/**
 * Recorta, em resolução nativa, as faixas da página onde ainda há `[?]`.
 *
 * Por que isso resolve: a página do scan tem ~2300×3350 (7,7 MP) e a leitura de
 * imagem reduz para ~1,15 MP — 2,6× menos resolução linear, justamente onde a
 * letra já estava difícil. Uma faixa de 480px de altura na largura original cabe
 * dentro do limite, então **nenhum pixel é descartado**. O mesmo trecho que veio
 * ilegível na página inteira costuma estar legível na faixa.
 *
 * Gera as faixas e um `tarefas.json` com o texto que falta completar. Um agente
 * lê as faixas e escreve `resolvidas.json`; `validar.mjs` aplica.
 *
 * Uso: node scripts/importar-prova-scan/zoom-lacunas.mjs <dir-trabalho>
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/pdf.mjs';
import { contarLacunas } from './lib/lacunas.mjs';

/** Altura máxima da faixa: mantém largura×altura sob ~1,15 MP em página larga. */
const ALTURA_FAIXA = 470;
/** Sobreposição entre faixas, para não cortar uma linha de texto ao meio. */
const SOBREPOSICAO = 60;
/** Margem acima e abaixo da região da questão. */
const MARGEM_PCT = 4;

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('uso: node zoom-lacunas.mjs <dir-trabalho>');
  process.exit(2);
}
const dir = resolve(dirArg);

const validacao = lerJson(join(dir, 'validacao.json'));
const indicePaginas = lerJson(join(dir, 'paginas', 'index.json'));
if (!validacao || !indicePaginas) {
  console.error(`faltam validacao.json/paginas/index.json em ${dir} — rode validar.mjs primeiro`);
  process.exit(2);
}
const infoPagina = new Map(indicePaginas.map((p) => [p.pagina_pdf, p]));

// ──── Questões que ainda têm lacuna ────

const CAMPOS = ['enunciado_apoio', 'enunciado'];
const pendentes = [];

for (const q of validacao.questoes) {
  const campos = {};
  for (const c of CAMPOS) {
    if (contarLacunas(q[c])) campos[c] = q[c];
  }
  for (const [letra, texto] of Object.entries(q.alternativas ?? {})) {
    if (contarLacunas(texto)) campos[`alternativa ${letra}`] = texto;
  }
  if (Object.keys(campos).length === 0) continue;
  pendentes.push({ numero: q.numero, paginas: q.paginas ?? [], posicao: q.posicao_topo_pct, campos });
}

if (pendentes.length === 0) {
  console.log('nenhuma lacuna pendente — nada a recortar');
  process.exit(0);
}

// Onde cada questão COMEÇA. Só a primeira página de uma questão entra aqui: nas
// páginas seguintes ela é continuação e começa no topo, não na altura que foi
// registrada na primeira. Confundir os dois recortava a região de outra questão.
const inicioPorPagina = new Map();
for (const q of validacao.questoes) {
  const primeira = (q.paginas ?? [])[0];
  if (primeira === undefined) continue;
  if (!inicioPorPagina.has(primeira)) inicioPorPagina.set(primeira, []);
  inicioPorPagina.get(primeira).push({ numero: q.numero, pct: q.posicao_topo_pct ?? 0 });
}
for (const lista of inicioPorPagina.values()) {
  lista.sort((a, b) => a.pct - b.pct);
}

/** Faixa vertical (em %) que a questão ocupa numa página específica. */
function regiaoNaPagina(q, pagina) {
  const naPagina = inicioPorPagina.get(pagina) ?? [];
  const ehPrimeira = (q.paginas ?? [])[0] === pagina;
  const idx = naPagina.findIndex((x) => x.numero === q.numero);

  // Continuação: começa no topo da página e vai até a primeira questão que
  // começa nela.
  if (!ehPrimeira || idx < 0) {
    return { topo: 0, base: naPagina[0]?.pct ?? 100 };
  }
  return { topo: naPagina[idx].pct, base: naPagina[idx + 1]?.pct ?? 100 };
}

// ──── Recorte ────

const dirLacunas = join(dir, 'lacunas');
rmSync(dirLacunas, { recursive: true, force: true });
mkdirSync(dirLacunas, { recursive: true });

const RECORTA = `
import sys, json
from PIL import Image
tarefas = json.loads(sys.argv[1])
for t in tarefas:
    img = Image.open(t["origem"])
    w, h = img.size
    topo = max(0, int(t["topo_pct"] / 100 * h))
    base = min(h, int(t["base_pct"] / 100 * h))
    if base - topo < 60:
        base = min(h, topo + 60)
    altura = ${ALTURA_FAIXA}
    passo = altura - ${SOBREPOSICAO}
    n = 0
    y = topo
    while y < base:
        fim = min(h, y + altura)
        img.crop((0, y, w, fim)).save(t["destino"].replace("{K}", str(n + 1)), "JPEG", quality=95)
        n += 1
        if fim >= base:
            break
        y += passo
    print(json.dumps({"numero": t["numero"], "pagina": t["pagina"], "faixas": n}))
`;

const tarefasPython = [];
for (const q of pendentes) {
  for (const pagina of q.paginas) {
    const info = infoPagina.get(pagina);
    if (!info || !existsSync(join(dir, info.arquivo))) continue;

    const { topo: inicioPct, base: fimPct } = regiaoNaPagina(q, pagina);

    tarefasPython.push({
      numero: q.numero,
      pagina,
      origem: join(dir, info.arquivo),
      destino: join(dirLacunas, `q${String(q.numero).padStart(3, '0')}-p${String(pagina).padStart(3, '0')}-f{K}.jpg`),
      topo_pct: Math.max(0, inicioPct - MARGEM_PCT),
      base_pct: Math.min(100, fimPct + MARGEM_PCT),
    });
  }
}

const saida = execFileSync('python3', ['-c', RECORTA, JSON.stringify(tarefasPython)], {
  encoding: 'utf-8',
});
const feitos = saida.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ──── Tarefas para o agente ────

const faixasPorQuestao = new Map();
for (const f of feitos) {
  const lista = faixasPorQuestao.get(f.numero) ?? [];
  for (let k = 1; k <= f.faixas; k += 1) {
    lista.push(`lacunas/q${String(f.numero).padStart(3, '0')}-p${String(f.pagina).padStart(3, '0')}-f${k}.jpg`);
  }
  faixasPorQuestao.set(f.numero, lista);
}

const tarefas = pendentes.map((q) => ({
  numero: q.numero,
  faixas: faixasPorQuestao.get(q.numero) ?? [],
  campos: q.campos,
}));

writeFileSync(join(dirLacunas, 'tarefas.json'), JSON.stringify(tarefas, null, 2) + '\n', 'utf-8');

const totalFaixas = [...faixasPorQuestao.values()].reduce((a, l) => a + l.length, 0);
const totalLacunas = pendentes.reduce(
  (a, q) => a + Object.values(q.campos).reduce((b, t) => b + contarLacunas(t), 0), 0);

console.log(`${pendentes.length} questões com lacuna, ${totalLacunas} lacunas`);
console.log(`${totalFaixas} faixas recortadas em resolução nativa (${ALTURA_FAIXA}px de altura)`);
console.log(`\ntarefas: ${join(dirLacunas, 'tarefas.json')}`);
console.log('\nagora despache agentes `transcritor` para ler as faixas e escrever');
console.log(`${join(dirLacunas, 'resolvidas.json')} no formato:`);
console.log('  { "7": { "alternativa c": "<texto completo, sem [?]>" }, ... }');
console.log('\nO que não der para ler mesmo com zoom deve continuar com [?] — chutar é pior.');
