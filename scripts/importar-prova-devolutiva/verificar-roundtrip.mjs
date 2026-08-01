#!/usr/bin/env node
/**
 * FASE 4 — Round-trip contra o parser real do `/admin/importar`.
 *
 * Delega para o verificador do pipeline do TPI, que já faz exatamente isto:
 * transpila `admin-importar.component.ts`, roda o `parseBlocos()` **de verdade**
 * contra `saida/prova.md` e confere campo por campo contra `validacao.json`.
 *
 * Ele não sabe nada sobre TPI — só lê `validacao.json` + `saida/prova.md`, que é
 * o contrato que este pipeline também cumpre. Duplicar o arquivo criaria duas
 * versões do único teste que fala com o parser de produção, e é justamente onde
 * divergir sairia mais caro.
 *
 * Uso:
 *   node verificar-roundtrip.mjs <dir-trabalho>
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CANONICO = join(import.meta.dirname, '..', 'importar-prova-scan', 'verificar-roundtrip.mjs');

const r = spawnSync(process.execPath, [CANONICO, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
