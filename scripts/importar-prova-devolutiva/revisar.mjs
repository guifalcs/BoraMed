#!/usr/bin/env node
/**
 * Gera o esqueleto de `questoes-revisadas.json` com as questões sinalizadas.
 *
 * O pipeline do TPI abre uma tela HTML com o scan ao lado da transcrição, porque
 * lá a dúvida é "a IA leu a foto certo?". Aqui não existe scan: o que precisa de
 * olho humano é um trecho em que a **camada de texto do PDF** saiu embaralhada,
 * e para isso o que ajuda é o texto atual em JSON editável, com as marcas
 * apontadas ao lado. Uma tela não acrescentaria nada.
 *
 * Uso:
 *   node revisar.mjs <dir-trabalho> [--todas]
 *
 * Escreve `$T/questoes-revisadas.json` (não sobrescreve um existente sem
 * `--forcar`). Edite os campos, marque `"revisado": true` e rode `validar.mjs`
 * de novo.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/relatorio.mjs';

const args = process.argv.slice(2);
const alvo = args.find((a) => !a.startsWith('--'));
const todas = args.includes('--todas');
const forcar = args.includes('--forcar');

if (!alvo) {
  console.error('uso: node revisar.mjs <dir-trabalho> [--todas] [--forcar]');
  process.exit(2);
}

const dir = resolve(alvo);
const validacao = lerJson(join(dir, 'validacao.json'));
if (!validacao) {
  console.error(`validacao.json não encontrado em ${dir} — rode validar.mjs primeiro`);
  process.exit(2);
}

const destino = join(dir, 'questoes-revisadas.json');
if (existsSync(destino) && !forcar) {
  console.error(`${destino} já existe. Edite-o, ou use --forcar para recriar (perde as edições).`);
  process.exit(2);
}

const selecionadas = validacao.questoes.filter((q) =>
  todas ? true : q.severidade_max === 'alta' || q.severidade_max === 'media',
);

if (selecionadas.length === 0) {
  console.log('Nenhuma questão sinalizada — nada a revisar.');
  process.exit(0);
}

const esqueleto = {};
for (const q of selecionadas) {
  esqueleto[String(q.numero)] = {
    // Deixado false de propósito: enquanto for false, `gerar.mjs` continua
    // excluindo a questão com flag alta. Vira true quando você conferiu.
    revisado: false,
    _flags: q.flags
      .filter((f) => f.severidade !== 'manual')
      .map((f) => `[${f.severidade}] ${f.codigo}: ${f.detalhe}`),
    _paginas_do_pdf: q.paginas,
    _formato: q.formato ?? 'fechada',
    _gabarito: q.formato === 'aberta' ? '(discursiva — o gabarito é a resposta modelo)' : q.letra_oficial,
    enunciado: q.enunciado,
    enunciado_apoio: q.enunciado_apoio,
    // Cada formato traz só o que tem: pôr `alternativas: {}` numa discursiva
    // convidaria a preencher, e alternativa em questão aberta é bloqueio.
    ...(q.formato === 'aberta'
      ? { resposta_modelo: q.resposta_modelo }
      : { alternativas: q.alternativas, explicacao: q.explicacao }),
    referencia: q.referencia,
  };
}

writeFileSync(destino, JSON.stringify(esqueleto, null, 2), 'utf-8');

console.log(`${selecionadas.length} questão(ões) no esqueleto: Q${selecionadas.map((q) => q.numero).join(', Q')}`);
console.log(`escrito: ${destino}`);
console.log('');
console.log('Como usar:');
console.log('  1. abra o PDF nas páginas indicadas em `_paginas_do_pdf` e compare;');
console.log('  2. corrija o texto dos campos (os que começam com `_` são só contexto);');
console.log('  3. troque `"revisado": false` por `true` nas que conferiu;');
console.log('  4. rode validar.mjs e gerar.mjs de novo.');
console.log('');
console.log('Campo que você não mexer mantém o valor extraído — `gerar.mjs` mescla campo a campo.');
