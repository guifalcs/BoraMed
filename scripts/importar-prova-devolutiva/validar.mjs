#!/usr/bin/env node
/**
 * FASE 2 — Validação determinística.
 *
 * Uso:
 *   node validar.mjs <dir-trabalho>
 *
 * Escreve `validacao.json` (consumido por gerar.mjs e por
 * verificar-roundtrip.mjs) e `relatorio-validacao.md`.
 *
 * Exit 1 com qualquer flag alta não resolvida. Exit 1 é bloqueio, não aviso.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson, paragrafosSuspeitos } from './lib/relatorio.mjs';
import { validarQuestao, LETRAS } from './lib/crivos.mjs';
import { colapsar } from './lib/texto.mjs';

/**
 * Aplica a revisão manual **antes** dos crivos.
 *
 * Sem isso o loop de revisão seria falso: a questão continuaria com a flag do
 * texto original e só ganharia um "mas foi revisada" por cima, então uma correção
 * que ainda deixasse texto corrompido passaria batido. Validando o texto
 * corrigido, a flag desaparece quando a correção é boa — e continua lá quando não
 * é.
 *
 * `trechos_suspeitos` é recalculado porque foi medido na extração, sobre o texto
 * que acabou de ser substituído.
 */
function aplicarRevisao(q, r) {
  if (!r) return q;

  const campo = (nome) => r[nome] ?? q[nome];
  const alternativas = { ...q.alternativas, ...(r.alternativas ?? {}) };
  const revisto = {
    ...q,
    enunciado: campo('enunciado'),
    enunciado_apoio: campo('enunciado_apoio'),
    alternativas,
    explicacao: campo('explicacao'),
    resposta_modelo: campo('resposta_modelo'),
    referencia: campo('referencia'),
  };

  revisto.trechos_suspeitos = [
    ...paragrafosSuspeitos([revisto.enunciado_apoio, revisto.enunciado].filter(Boolean).join('\n\n'))
      .map((s) => ({ campo: 'enunciado', ...s })),
    ...Object.entries(alternativas).flatMap(([l, t]) =>
      paragrafosSuspeitos(t).map((s) => ({ campo: `alternativa ${l.toUpperCase()}`, ...s })),
    ),
    ...paragrafosSuspeitos(revisto.explicacao ?? '').map((s) => ({ campo: 'explicacao', ...s })),
    ...paragrafosSuspeitos(revisto.resposta_modelo ?? '').map((s) => ({ campo: 'resposta_modelo', ...s })),
    ...paragrafosSuspeitos(revisto.referencia ?? '').map((s) => ({ campo: 'referencia', ...s })),
  ];

  return revisto;
}

const alvo = process.argv[2];
if (!alvo) {
  console.error('uso: node validar.mjs <dir-trabalho>');
  process.exit(2);
}
const dir = resolve(alvo);

const extraido = lerJson(join(dir, 'questoes.json'));
if (!extraido) {
  console.error(`questoes.json não encontrado em ${dir} — rode extrair.mjs primeiro`);
  process.exit(2);
}

const revisadas = lerJson(join(dir, 'questoes-revisadas.json')) ?? {};
const questoes = extraido.questoes.map((q) =>
  validarQuestao(aplicarRevisao(q, revisadas[String(q.numero)])),
);

for (const q of questoes) {
  q.revisado = revisadas[String(q.numero)]?.revisado === true;
}

const nConferidas = Object.values(revisadas).filter((r) => r?.revisado === true).length;
if (Object.keys(revisadas).length > 0) {
  console.log(
    `revisão manual: ${Object.keys(revisadas).length} questão(ões) no arquivo, ` +
    `${nConferidas} marcada(s) como revisada(s) — crivos rodando sobre o texto corrigido\n`,
  );
}

writeFileSync(
  join(dir, 'validacao.json'),
  JSON.stringify({ questoes }, null, 2),
  'utf-8',
);

// ──── Relatório ────

const porSeveridade = (s) => questoes.filter((q) => q.severidade_max === s);
const altas = porSeveridade('alta');
const altasPendentes = altas.filter((q) => !q.revisado);
const medias = porSeveridade('media');
const baixas = porSeveridade('baixa');
const limpas = questoes.filter((q) => q.severidade_max === null);

const NIVEIS_COBERTURA = [
  'forte',
  'forte_por_eliminacao',
  'media',
  'presenca',
  'inaplicavel',
  'sem_eco',
  'ausente',
  'nao_se_aplica',
];
const cobertura = NIVEIS_COBERTURA.map((n) => ({
  nivel: n,
  quantas: questoes.filter((q) => q.cobertura === n).length,
}));

const comImagem = questoes.filter((q) => q.tem_imagem);
const comTabela = questoes.filter((q) => q.tem_tabela);

const fechadas = questoes.filter((q) => q.formato !== 'aberta');
const abertas = questoes.filter((q) => q.formato === 'aberta');

const md = [];
md.push('# Relatório de validação — relatório de devolutiva\n');
md.push(
  `${questoes.length} questões: ${fechadas.length} fechadas e ${abertas.length} discursivas. ` +
  'O gabarito das fechadas vem da marcação `(CORRETA)` do próprio relatório; o das discursivas ' +
  'é a resposta comentada, importada como `RESPOSTA_MODELO`.\n',
);
if (abertas.length > 0) {
  md.push(`Discursivas: Q${abertas.map((q) => q.numero).join(', Q')}.\n`);
}

md.push('## Resumo\n');
md.push('| severidade | questões |');
md.push('| --- | --- |');
md.push(`| alta (bloqueia) | ${altas.length}${altas.length ? ` — Q${altas.map((q) => q.numero).join(', Q')}` : ''} |`);
md.push(`| média | ${medias.length}${medias.length ? ` — Q${medias.map((q) => q.numero).join(', Q')}` : ''} |`);
md.push(`| baixa | ${baixas.length}${baixas.length ? ` — Q${baixas.map((q) => q.numero).join(', Q')}` : ''} |`);
md.push(`| sem flag | ${limpas.length} |`);
md.push('');

md.push('## Cobertura do cruzamento (CORRETA) × resposta comentada\n');
md.push(
  'A marcação `(CORRETA)` é metadado da questão; a resposta comentada é prosa de quem ' +
  'escreveu. São duas fontes independentes dentro do mesmo PDF, e é isso que confere o ' +
  'gabarito. Onde a coluna diz `sem_eco`, o comentário não descreve as alternativas de ' +
  'forma reconhecível — **não é erro detectado, é confirmação ausente**.\n',
);
md.push('| nível | o que foi conferido | questões |');
md.push('| --- | --- | --- |');
const descricaoCobertura = {
  forte: 'o comentário julga correta exatamente a alternativa marcada, e só ela',
  forte_por_eliminacao: 'o comentário julga incorretas **todas** as outras alternativas',
  media: 'o comentário julga a marcada correta, mas também outra',
  presenca: 'o texto da marcada aparece no comentário, sem veredito legível',
  inaplicavel: 'questão de assertivas cujo comentário não julga os numerais um a um',
  sem_eco: 'o comentário não descreve as alternativas de forma reconhecível',
  ausente: 'a questão não tem resposta comentada',
  nao_se_aplica: 'questão discursiva — não há alternativa marcada para cruzar (ver crivo da discursiva)',
};
for (const c of cobertura) {
  md.push(`| ${c.nivel} | ${descricaoCobertura[c.nivel]} | ${c.quantas} |`);
}
md.push('');

if (altas.length > 0) {
  md.push('## Flags altas — detalhe\n');
  for (const q of altas) {
    md.push(`### Q${q.numero} (p. ${q.paginas.join(', ')})${q.revisado ? ' — marcada como revisada' : ''}\n`);
    for (const f of q.flags.filter((f) => f.severidade === 'alta')) {
      md.push(`- \`${f.codigo}\` — ${f.detalhe}`);
    }
    md.push('');
    md.push(`- gabarito marcado: **${(q.letra_oficial ?? '—').toUpperCase()}**`);
    md.push(`- enunciado: ${colapsar(q.enunciado).slice(0, 160)}`);
    md.push('');
  }
}

const medBaixa = [...medias, ...baixas];
if (medBaixa.length > 0) {
  md.push('## Flags médias e baixas\n');
  md.push('| questão | flag | detalhe |');
  md.push('| --- | --- | --- |');
  for (const q of medBaixa) {
    for (const f of q.flags.filter((f) => f.severidade === 'media' || f.severidade === 'baixa')) {
      md.push(`| ${q.numero} | \`${f.codigo}\` | ${f.detalhe.replace(/\|/g, '\\|').slice(0, 140)} |`);
    }
  }
  md.push('');
}

md.push('## Trabalho manual depois de importar\n');
md.push(
  'O markdown do `/admin/importar` não transporta figura nem grade de tabela. Estas ' +
  'questões entram sem isso e precisam de um passe manual em `/admin/questoes` — ' +
  'a lista completa, com trecho para busca, está em `saida/PENDENCIAS.md`.\n',
);
md.push(`- questões com imagem: ${comImagem.length}${comImagem.length ? ` — Q${comImagem.map((q) => q.numero).join(', Q')}` : ''}`);
md.push(`- questões com tabela: ${comTabela.length}${comTabela.length ? ` — Q${comTabela.map((q) => q.numero).join(', Q')}` : ''}`);
md.push('');

writeFileSync(join(dir, 'relatorio-validacao.md'), md.join('\n'), 'utf-8');

// ──── Console ────

console.log(`questões : ${questoes.length}`);
console.log(`  alta   : ${altas.length}${altas.length ? ` → Q${altas.map((q) => q.numero).join(', Q')}` : ''}`);
console.log(`  média  : ${medias.length}`);
console.log(`  baixa  : ${baixas.length}`);
console.log(`  limpas : ${limpas.length}`);
console.log('');
console.log('cobertura do cruzamento:');
for (const c of cobertura) console.log(`  ${c.nivel.padEnd(9)} ${c.quantas}`);
console.log('');
console.log(`imagem   : ${comImagem.length}${comImagem.length ? ` → Q${comImagem.map((q) => q.numero).join(', Q')}` : ''}`);
console.log(`tabela   : ${comTabela.length}${comTabela.length ? ` → Q${comTabela.map((q) => q.numero).join(', Q')}` : ''}`);
console.log('');

// Distribuição de flags, para calibrar limiar em vez de culpar a extração.
const contagem = {};
for (const q of questoes) for (const f of q.flags) contagem[f.codigo] = (contagem[f.codigo] ?? 0) + 1;
const ordenadas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
if (ordenadas.length > 0) {
  console.log('flags por código:');
  for (const [c, n] of ordenadas) console.log(`  ${String(n).padStart(3)}  ${c}`);
  console.log('');
}

console.log(`escrito: ${join(dir, 'validacao.json')}`);
console.log(`         ${join(dir, 'relatorio-validacao.md')}`);

if (altasPendentes.length > 0) {
  console.error('');
  console.error(`── ${altasPendentes.length} questão(ões) com flag alta não resolvida ──`);
  for (const q of altasPendentes) {
    const codigos = q.flags.filter((f) => f.severidade === 'alta').map((f) => f.codigo);
    console.error(`  Q${q.numero} (p.${q.paginas.join(',')}): ${codigos.join(', ')}`);
  }
  console.error('');
  console.error('Leia relatorio-validacao.md, corrija em questoes-revisadas.json');
  console.error('(veja o README) e rode validar.mjs de novo.');
  process.exit(1);
}

// Só para as fechadas: a discursiva não tem letra, e o gabarito dela é a
// resposta modelo, cobrada pelo `crivoDiscursiva`.
const naoLetras = fechadas.filter((q) => !LETRAS.includes((q.letra_oficial ?? '').toLowerCase()));
if (naoLetras.length > 0) {
  console.error(`gabarito inválido em Q${naoLetras.map((q) => q.numero).join(', Q')}`);
  process.exit(1);
}

console.log('');
console.log(`próximo: node ${join(import.meta.dirname, 'gerar.mjs')} ${dir} --fonte "<nome da prova>"`);
