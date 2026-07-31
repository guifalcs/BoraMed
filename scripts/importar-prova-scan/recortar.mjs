#!/usr/bin/env node
/**
 * Recorta as figuras embutidas nas questões, a partir da banda vertical
 * estimada na transcrição (`imagem_topo_pct` / `imagem_base_pct`).
 *
 * O recorte é aproximado de propósito: serve para você conferir e ajustar
 * antes de anexar a imagem na questão pelo /admin/questoes. Uma margem de
 * folga é aplicada para não cortar legenda nem eixo do gráfico.
 *
 * Uso: node scripts/importar-prova-scan/recortar.mjs <dir-trabalho> [--folga 3]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/pdf.mjs';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('uso: node recortar.mjs <dir-trabalho> [--folga 3]');
  process.exit(2);
}
const dir = resolve(dirArg);
const iFolga = process.argv.indexOf('--folga');
const folga = iFolga >= 0 ? Number(process.argv[iFolga + 1]) : 3;

const tarefas = lerJson(join(dir, 'saida', '.recortes.json'));
if (!tarefas || tarefas.length === 0) {
  console.log('nenhum recorte pendente — rode gerar.mjs primeiro');
  process.exit(0);
}

const script = `
import sys, json
from PIL import Image
folga = float(sys.argv[1])
tarefas = json.loads(sys.argv[2])
for t in tarefas:
    try:
        img = Image.open(t["origem"])
    except Exception as e:
        print(f'  ✗ {t["destino"]}: {e}')
        continue
    w, h = img.size
    topo = max(0.0, (t["topo"] - folga) / 100.0) * h
    base = min(float(h), ((t["base"] + folga) / 100.0) * h)
    if base - topo < 40:
        print(f'  ✗ {t["destino"]}: banda degenerada ({t["topo"]}%–{t["base"]}%)')
        continue
    img.crop((0, int(topo), w, int(base))).save(t["destino"], "JPEG", quality=92)
    print(f'  ✓ {t["destino"]} ({w}×{int(base - topo)})')
`;

mkdirSync(join(dir, 'saida', 'imagens'), { recursive: true });
const validas = tarefas.filter((t) => existsSync(t.origem));
if (validas.length !== tarefas.length) {
  console.log(`⚠ ${tarefas.length - validas.length} páginas de origem não encontradas`);
}

console.log(`recortando ${validas.length} figuras (folga ${folga}%)...`);
const saida = execFileSync('python3', ['-c', script, String(folga), JSON.stringify(validas)], {
  encoding: 'utf-8',
});
process.stdout.write(saida);
console.log(`\nrecortes em ${join(dir, 'saida', 'imagens')}`);
console.log('confira cada um; ajuste manualmente o que ficou cortado antes de subir.');
