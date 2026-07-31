#!/usr/bin/env node
/**
 * FASE 4 — Geração do markdown de importação.
 *
 * Emite exatamente o formato lido por `parseBlocos()` em
 * frontend/src/app/(admin)/importar/admin-importar.component.ts, para colar
 * em /admin/importar.
 *
 * Correções feitas na tela de revisão (`questoes-revisadas.json`) têm
 * precedência sobre a transcrição original.
 *
 * Uso:
 *   node gerar.mjs <dir-trabalho> --fonte "TPI 2025.1" [opções]
 *
 * Opções:
 *   --fonte <txt>     valor do campo FONTE (obrigatório)
 *   --tipo <t>        nacional | processual | laboratorio   (padrão: nacional)
 *   --lote <n>        divide a saída em arquivos de n questões (padrão: 30)
 *   --incluir-alta    inclui questões com flag alta não resolvida (padrão: exclui)
 *   --sem-explicacao  omite EXPLICACAO/REFERENCIA (markdown bem menor)
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/pdf.mjs';
import { LETRAS } from './lib/transcricao.mjs';
import { colapsar } from './lib/texto.mjs';

function opcoes() {
  const a = process.argv.slice(2);
  const val = (nome, padrao) => {
    const i = a.indexOf(nome);
    return i >= 0 ? a[i + 1] : padrao;
  };
  return {
    dir: a.find((x) => !x.startsWith('--')),
    fonte: val('--fonte', null),
    tipo: val('--tipo', 'nacional'),
    lote: parseInt(val('--lote', '30'), 10),
    incluirAlta: a.includes('--incluir-alta'),
    semExplicacao: a.includes('--sem-explicacao'),
  };
}

const o = opcoes();
if (!o.dir) {
  console.error('uso: node gerar.mjs <dir-trabalho> --fonte "TPI 2025.1" [--tipo nacional] [--lote 30]');
  process.exit(2);
}
if (!o.fonte) {
  console.error('--fonte é obrigatório (ex: --fonte "TPI 2025.1")');
  process.exit(2);
}
if (!['nacional', 'processual', 'laboratorio'].includes(o.tipo)) {
  console.error(`--tipo inválido: ${o.tipo} (use nacional, processual ou laboratorio)`);
  process.exit(2);
}

const dir = resolve(o.dir);
const validacao = lerJson(join(dir, 'validacao.json'));
if (!validacao) {
  console.error(`validacao.json não encontrado em ${dir} — rode validar.mjs primeiro`);
  process.exit(2);
}

/**
 * Prefixos que o parser do admin interpreta como rótulo de campo no início de
 * uma linha — todos case-insensitive, o que os torna perigosos dentro do
 * conteúdo. Casos reais nesta prova:
 *
 *   - "Fonte: Federação Internacional de Ginecologia..." (legenda de figura no
 *     texto de apoio) seria consumida como o campo FONTE e desapareceria do
 *     enunciado.
 *   - "Gabarito: A alternativa correta..." na devolutiva casaria com
 *     /^GABARITO:\s*([A-Ea-e])/i e sobrescreveria o gabarito oficial pela
 *     letra "A" da palavra "A alternativa".
 *
 * Ver parseQuestaoBloco() em admin-importar.component.ts.
 */
const RESERVADO = new RegExp(
  '^\\s*(?:' +
    '---\\s*$' +
    '|(?:ENUNCIADO|ENUNCIADO_APOIO|ALTERNATIVAS|RESPOSTA_MODELO|PONTOS_CHAVE)\\s*$' +
    '|(?:FORMATO|CRITERIOS|GABARITO|TIPO|DISCIPLINA|TEMAS?|REFERENCIA|FONTE|EXPLICACAO)\\s*:' +
  ')',
  'i',
);

const revisadas = lerJson(join(dir, 'questoes-revisadas.json')) ?? {};
const nRevisadas = Object.keys(revisadas).length;
if (nRevisadas > 0) console.log(`revisão manual aplicada a ${nRevisadas} questões`);

// ──── Seleção ────

const incluidas = [];
const excluidas = [];

for (const q of validacao.questoes) {
  const revisao = revisadas[String(q.numero)] ?? null;
  const resolvida = revisao?.revisado === true;
  const temAltaPendente = q.severidade_max === 'alta' && !resolvida;

  const motivos = [];
  if (temAltaPendente && !o.incluirAlta) {
    motivos.push(...q.flags.filter((f) => f.severidade === 'alta').map((f) => f.codigo));
  }
  if (!q.letra_oficial) motivos.push('sem_gabarito_oficial');

  const item = montar(q, revisao);

  // Bloqueios estruturais: nem --incluir-alta passa por cima disso, porque o
  // parser do admin rejeitaria (ou pior, importaria questão mutilada).
  if (!item.enunciado) motivos.push('enunciado_vazio');
  const presentes = LETRAS.filter((l) => item.alternativas[l]);
  if (presentes.length < 2) motivos.push('menos_de_2_alternativas');
  if (!item.alternativas[item.letra]) motivos.push('gabarito_sem_alternativa');
  // Rótulo do parser na primeira linha de um campo: emitir isso corromperia a
  // questão silenciosamente na importação.
  if (rotuloNoInicio(item.enunciado)) motivos.push('rotulo_no_inicio_enunciado');
  if (rotuloNoInicio(item.enunciado_apoio)) motivos.push('rotulo_no_inicio_apoio');

  if (motivos.length > 0) {
    excluidas.push({ numero: q.numero, motivos: [...new Set(motivos)] });
    continue;
  }
  incluidas.push(item);
}

// ──── Blocos markdown ────

function bloco(item) {
  const l = [];
  l.push('---');
  l.push('ENUNCIADO');
  l.push(proteger(item.enunciado));
  if (item.enunciado_apoio) {
    l.push('');
    l.push('ENUNCIADO_APOIO');
    l.push(proteger(item.enunciado_apoio));
  }
  l.push('');
  l.push('ALTERNATIVAS');
  for (const letra of LETRAS) {
    if (!item.alternativas[letra]) continue;
    l.push(`${letra.toUpperCase()}) ${item.alternativas[letra]}`);
  }
  l.push('');
  l.push(`GABARITO: ${item.letra.toUpperCase()}`);
  l.push(`TIPO: ${o.tipo}`);
  l.push(`FONTE: ${item.fonte}`);
  if (!o.semExplicacao) {
    if (item.explicacao) l.push(`EXPLICACAO: ${proteger(item.explicacao)}`);
    if (item.referencia) l.push(`REFERENCIA: ${proteger(item.referencia)}`);
  }
  l.push('---');
  return l.join('\n');
}

const blocos = incluidas.map(bloco);

const dirSaida = join(dir, 'saida');
rmSync(dirSaida, { recursive: true, force: true });
mkdirSync(dirSaida, { recursive: true });

writeFileSync(join(dirSaida, 'prova.md'), blocos.join('\n') + '\n', 'utf-8');

const lotes = [];
for (let i = 0; i < blocos.length; i += o.lote) {
  const parte = blocos.slice(i, i + o.lote);
  const nome = `parte-${String(lotes.length + 1).padStart(2, '0')}.md`;
  writeFileSync(join(dirSaida, nome), parte.join('\n') + '\n', 'utf-8');
  lotes.push({ nome, questoes: parte.length, de: incluidas[i].numero, ate: incluidas[Math.min(i + o.lote, blocos.length) - 1].numero });
}

// ──── Pendências ────

const comImagem = incluidas.filter((i) => i.tem_imagem);
const pendencias = [];
pendencias.push('# Pendências pós-importação\n');

if (comImagem.length > 0) {
  pendencias.push('## Questões com imagem embutida\n');
  pendencias.push(
    'O markdown do `/admin/importar` não carrega imagem. Estas questões entram sem a figura — ' +
    'abra cada uma em `/admin/questoes` e anexe o recorte de `saida/imagens/`.\n',
  );
  pendencias.push('| questão | página do scan | recorte |');
  pendencias.push('| --- | --- | --- |');
  for (const i of comImagem) {
    pendencias.push(`| ${i.numero} | ${i.paginas.join(', ')} | \`imagens/q${String(i.numero).padStart(3, '0')}.jpg\` |`);
  }
  pendencias.push('');
}

if (excluidas.length > 0) {
  pendencias.push('## Questões NÃO incluídas no markdown\n');
  pendencias.push('| questão | motivo |');
  pendencias.push('| --- | --- |');
  for (const e of excluidas) {
    pendencias.push(`| ${e.numero} | ${e.motivos.map((m) => `\`${m}\``).join(', ')} |`);
  }
  pendencias.push('');
  pendencias.push('Resolva na tela de revisão (`revisao.html`), marque como revisado e rode `gerar.mjs` de novo.\n');
}

pendencias.push('## Classificação (disciplina/tema)\n');
pendencias.push(
  'O markdown sai sem `DISCIPLINA`/`TEMA` de propósito — o prompt do admin manda omitir ' +
  'quando não há certeza, e a devolutiva não usa a nomenclatura cadastrada. ' +
  'Veja `classificacao-sugerida.csv` para as questões em que a devolutiva declara Área/Subárea/Tema.\n',
);

writeFileSync(join(dirSaida, 'PENDENCIAS.md'), pendencias.join('\n'), 'utf-8');

// ──── Recortes das imagens ────

if (comImagem.length > 0) {
  mkdirSync(join(dirSaida, 'imagens'), { recursive: true });
  const tarefas = comImagem
    .filter((i) => i.imagem_topo_pct !== null && i.imagem_base_pct !== null)
    .map((i) => ({
      origem: join(dir, 'paginas', `p${String(i.paginas[0]).padStart(3, '0')}.jpg`),
      destino: join(dirSaida, 'imagens', `q${String(i.numero).padStart(3, '0')}.jpg`),
      topo: i.imagem_topo_pct,
      base: i.imagem_base_pct,
    }));
  if (tarefas.length > 0) {
    writeFileSync(join(dirSaida, '.recortes.json'), JSON.stringify(tarefas), 'utf-8');
    console.log(`\n${tarefas.length} recortes de imagem pendentes — rode:`);
    console.log(`  node ${join(import.meta.dirname, 'recortar.mjs')} ${dir}`);
  }
}

// ──── Resumo ────

console.log('');
console.log(`incluídas : ${incluidas.length} / ${validacao.questoes.length}`);
console.log(`excluídas : ${excluidas.length}${excluidas.length ? ` (${excluidas.map((e) => e.numero).join(', ')})` : ''}`);
console.log(`com imagem: ${comImagem.length}`);
console.log('');
console.log(`saída: ${dirSaida}`);
console.log(`  prova.md — ${incluidas.length} blocos, tudo de uma vez`);
for (const l of lotes) console.log(`  ${l.nome} — questões ${l.de}–${l.ate} (${l.questoes})`);
console.log(`  PENDENCIAS.md`);
console.log('');
console.log('Cole o conteúdo em /admin/importar → aba Questões. Lotes menores dão feedback');
console.log('de erro mais cedo; prova.md serve se quiser tudo numa tacada.');

// ──── Helpers ────

/**
 * Monta o item final aplicando a revisão manual campo a campo. Só sobrescreve
 * o que a revisão realmente trouxe — campo ausente mantém o valor validado.
 */
function montar(q, revisao) {
  const r = revisao ?? {};
  const alternativas = { ...q.alternativas, ...(r.alternativas ?? {}) };
  for (const letra of Object.keys(alternativas)) {
    alternativas[letra] = colapsar(alternativas[letra] ?? '');
    if (!alternativas[letra]) delete alternativas[letra];
  }
  const letra = (r.letra_oficial ?? q.letra_oficial ?? '').toLowerCase();

  return {
    numero: q.numero,
    paginas: q.paginas ?? [],
    letra,
    enunciado: colapsar(r.enunciado ?? q.enunciado ?? ''),
    enunciado_apoio: colapsar(r.enunciado_apoio ?? q.enunciado_apoio ?? ''),
    alternativas,
    explicacao: r.explicacao ?? q.explicacao ?? null,
    referencia: r.referencia ?? q.referencia ?? null,
    tem_imagem: r.tem_imagem ?? q.tem_imagem ?? false,
    imagem_topo_pct: q.imagem_topo_pct ?? null,
    imagem_base_pct: q.imagem_base_pct ?? null,
    fonte: q.fonte_original
      ? `${o.fonte} — Q${String(q.numero).padStart(3, '0')} (${q.fonte_original})`
      : `${o.fonte} — Q${String(q.numero).padStart(3, '0')}`,
  };
}

/**
 * Preserva os parágrafos do conteúdo, mas nunca deixa uma linha começar com um
 * rótulo do parser: essas linhas são grudadas na anterior. O texto é mantido
 * na íntegra — só a posição da quebra de linha muda.
 *
 * A primeira linha não tem para onde ser grudada, e indentar não resolve (o
 * parser dá `trim()` antes de testar). Esse caso é detectado por
 * `rotuloNoInicio()` e a questão é excluída da saída, nunca emitida quebrada.
 */
function proteger(texto) {
  const linhas = colapsarParagrafos(texto).split('\n');
  const saida = [];
  for (const linha of linhas) {
    if (saida.length > 0 && RESERVADO.test(linha)) {
      saida[saida.length - 1] = `${saida.at(-1)} ${linha.trim()}`.trim();
      continue;
    }
    saida.push(linha);
  }
  return saida.join('\n');
}

/** Detecta o único caso que `proteger()` não consegue neutralizar. */
function rotuloNoInicio(texto) {
  if (!texto) return false;
  return RESERVADO.test(colapsarParagrafos(texto).split('\n')[0] ?? '');
}

/** Uma linha por parágrafo; o parser do admin descarta linhas em branco. */
function colapsarParagrafos(texto) {
  return String(texto)
    .split(/\n{2,}/)
    .map((p) => colapsar(p))
    .filter(Boolean)
    .join('\n');
}
