#!/usr/bin/env node
/**
 * FASE 3 — Geração do markdown de importação.
 *
 * Emite exatamente o formato lido por `parseBlocos()` em
 * frontend/src/app/(admin)/importar/admin-importar.component.ts.
 *
 * Uso:
 *   node gerar.mjs <dir-trabalho> --fonte "Integradora 4 (2025.2)" [opções]
 *
 * Opções:
 *   --fonte <txt>     valor do campo FONTE (obrigatório)
 *   --tipo <t>        nacional | processual | laboratorio   (padrão: nacional)
 *   --lote <n>        divide a saída em arquivos de n questões (padrão: 25)
 *   --incluir-alta    inclui questões com flag alta não resolvida (padrão: exclui)
 *   --sem-explicacao  omite EXPLICACAO/REFERENCIA (markdown bem menor)
 *
 * Termina imprimindo o bloco INSERIR MANUALMENTE, que é a única parte que o
 * pipeline não resolve: o markdown do admin não transporta figura nem grade de
 * tabela.
 */

import { writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/relatorio.mjs';
import { LETRAS, RESERVADO } from './lib/crivos.mjs';
import { substituirTabelas, PLACEHOLDER_TABELA } from './lib/midia.mjs';
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
    lote: parseInt(val('--lote', '25'), 10),
    incluirAlta: a.includes('--incluir-alta'),
    semExplicacao: a.includes('--sem-explicacao'),
  };
}

const o = opcoes();
if (!o.dir) {
  console.error('uso: node gerar.mjs <dir-trabalho> --fonte "Integradora 4 (2025.2)"');
  process.exit(2);
}
if (!o.fonte) {
  console.error('--fonte é obrigatório (ex: --fonte "Integradora 4 (2025.2)")');
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

const revisadas = lerJson(join(dir, 'questoes-revisadas.json')) ?? {};
const nEsqueleto = Object.keys(revisadas).length;
const nConferidas = Object.values(revisadas).filter((r) => r?.revisado === true).length;
if (nEsqueleto > 0) {
  // Distinguir as duas coisas importa: o esqueleto de `revisar.mjs` já traz o
  // texto extraído em todas, então "9 no arquivo" não quer dizer "9 conferidas",
  // e só as conferidas liberam questão com flag alta para o markdown.
  console.log(
    `questoes-revisadas.json: ${nEsqueleto} questão(ões) no arquivo, ` +
    `${nConferidas} marcada(s) como revisada(s)`,
  );
}

// ──── Seleção ────

const incluidas = [];
const excluidas = [];

for (const q of validacao.questoes) {
  const revisao = revisadas[String(q.numero)] ?? null;
  const resolvida = revisao?.revisado === true;
  const item = montar(q, revisao);

  const motivos = [];
  if (q.severidade_max === 'alta' && !resolvida && !o.incluirAlta) {
    motivos.push(...q.flags.filter((f) => f.severidade === 'alta').map((f) => f.codigo));
  }
  // Bloqueios estruturais: nem --incluir-alta passa por cima, porque o parser do
  // admin rejeitaria — ou pior, importaria questão mutilada em silêncio.
  if (!item.enunciado) motivos.push('enunciado_vazio');
  if (LETRAS.filter((l) => item.alternativas[l]).length < 2) motivos.push('menos_de_2_alternativas');
  if (!item.letra || !item.alternativas[item.letra]) motivos.push('gabarito_sem_alternativa');
  if (rotuloNoInicio(item.enunciado)) motivos.push('rotulo_no_inicio_enunciado');
  if (rotuloNoInicio(item.enunciado_apoio)) motivos.push('rotulo_no_inicio_apoio');

  if (motivos.length > 0) {
    excluidas.push({ numero: q.numero, motivos: [...new Set(motivos)], item });
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
mkdirSync(dirSaida, { recursive: true });

// Remove só o que esta etapa gera, e não `saida/` inteiro: `extrair-imagens.mjs`
// escreve em `saida/imagens/` e apagar a pasta levaria as figuras já extraídas
// junto num segundo `gerar.mjs`.
for (const f of readdirSync(dirSaida)) {
  if (f === 'prova.md' || f === 'PENDENCIAS.md' || /^parte-\d+\.md$/.test(f)) {
    rmSync(join(dirSaida, f), { force: true });
  }
}

writeFileSync(join(dirSaida, 'prova.md'), blocos.join('\n') + '\n', 'utf-8');

const lotes = [];
for (let i = 0; i < blocos.length; i += o.lote) {
  const parte = blocos.slice(i, i + o.lote);
  const nome = `parte-${String(lotes.length + 1).padStart(2, '0')}.md`;
  writeFileSync(join(dirSaida, nome), parte.join('\n') + '\n', 'utf-8');
  lotes.push({
    nome,
    questoes: parte.length,
    de: incluidas[i].numero,
    ate: incluidas[Math.min(i + o.lote, blocos.length) - 1].numero,
  });
}

// ──── PENDENCIAS.md ────

const comImagem = incluidas.filter((i) => i.tem_imagem);
const comTabela = incluidas.filter((i) => i.tem_tabela);

const p = [];
p.push('# Pendências pós-importação\n');
p.push(`Prova: **${o.fonte}** — ${incluidas.length} questões no markdown.\n`);

if (comImagem.length > 0) {
  p.push('## Questões com imagem\n');
  p.push(
    'O pipeline não tenta descrever figura em texto: sinaliza e para aqui. Procure o trecho ' +
    'na busca do `/admin/questoes`, abra a questão e anexe a imagem.\n',
  );
  p.push(
    'A coluna **imagem está no PDF?** diz de onde ela vem. Quando o relatório preservou o ' +
    'raster, `extrair-imagens.mjs` gera o arquivo em `saida/imagens/`. Quando não, o gerador ' +
    'do relatório descartou a figura e ela precisa vir da fonte original (plataforma da AFYA ' +
    'ou caderno da prova).\n',
  );
  p.push('| questão | gabarito | busque no admin por | página do PDF | imagem está no PDF? |');
  p.push('| --- | --- | --- | --- | --- |');
  for (const i of comImagem) {
    p.push(
      `| ${i.numero} | ${i.letra.toUpperCase()} | ${trechoParaBusca(i)} | ${i.paginas.join(', ')} ` +
      `| ${i.imagem_embutida ? '**sim** → `saida/imagens/q' + String(i.numero).padStart(3, '0') + '-*.jpg`' : 'não — buscar na fonte'} |`,
    );
  }
  p.push('');
  p.push('### Por que cada uma foi sinalizada\n');
  for (const i of comImagem) {
    p.push(`**Q${String(i.numero).padStart(3, '0')}** (gabarito ${i.letra.toUpperCase()})`);
    for (const s of i.sinais_imagem) p.push(`- ${s}`);
    p.push(`- enunciado: ${colapsar([i.enunciado_apoio, i.enunciado].filter(Boolean).join(' ')).slice(0, 400)}`);
    p.push('');
  }
}

if (comTabela.length > 0) {
  p.push('## Questões com tabela ou quadro de dados\n');
  p.push(
    `As linhas em colunas alinhadas **não** foram achatadas em texto corrido: foram ` +
    `substituídas por \`${PLACEHOLDER_TABELA}\` na posição em que estavam. Remonte a ` +
    'tabela em `/admin/questoes` e apague o placeholder.\n',
  );
  p.push('| questão | gabarito | busque no admin por | página do PDF | placeholder no markdown? |');
  p.push('| --- | --- | --- | --- | --- |');
  for (const i of comTabela) {
    p.push(
      `| ${i.numero} | ${i.letra.toUpperCase()} | ${trechoParaBusca(i)} | ${i.paginas.join(', ')} ` +
      `| ${i.tabelas_substituidas > 0 ? `sim (${i.tabelas_substituidas})` : 'não — só menção no texto'} |`,
    );
  }
  p.push('');
  p.push('### Conteúdo removido, para remontar\n');
  for (const i of comTabela) {
    p.push(`**Q${String(i.numero).padStart(3, '0')}**`);
    for (const s of i.sinais_tabela) p.push(`- ${s}`);
    for (const bloco of i.blocos_tabulares ?? []) {
      p.push('');
      p.push('```');
      for (const linha of bloco) p.push(linha);
      p.push('```');
    }
    p.push('');
  }
}

if (excluidas.length > 0) {
  p.push('## Questões NÃO incluídas no markdown\n');
  p.push('| questão | motivo |');
  p.push('| --- | --- |');
  for (const e of excluidas) {
    p.push(`| ${e.numero} | ${e.motivos.map((m) => `\`${m}\``).join(', ')} |`);
  }
  p.push('');
  p.push(
    'Corrija em `questoes-revisadas.json` (veja o README), rode `validar.mjs` e ' +
    '`gerar.mjs` de novo.\n',
  );
}

p.push('## Vínculo com a prova e classificação\n');
p.push(
  '- `/admin/importar` **não** liga questão a prova. Depois de importar, crie a prova em ' +
  '`/admin/provas` com subtipo **Integradora** e vincule as questões.\n' +
  '- `DISCIPLINA`/`TEMA` saem vazios de propósito: a nomenclatura dos filtros do relatório ' +
  'não corresponde ao cadastro. `classificacao-sugerida.csv` traz Área, Subárea, Semana e ' +
  'Módulo de cada questão, direto do bloco "Filtros da questão".\n',
);

writeFileSync(join(dirSaida, 'PENDENCIAS.md'), p.join('\n'), 'utf-8');

// ──── Resumo ────

console.log('');
console.log(`incluídas : ${incluidas.length} / ${validacao.questoes.length}`);
console.log(`excluídas : ${excluidas.length}${excluidas.length ? ` (Q${excluidas.map((e) => e.numero).join(', Q')})` : ''}`);
console.log('');
console.log(`saída: ${dirSaida}`);
console.log(`  prova.md — ${incluidas.length} blocos, tudo de uma vez`);
for (const l of lotes) console.log(`  ${l.nome} — questões ${l.de}–${l.ate} (${l.questoes})`);
console.log('  PENDENCIAS.md');
console.log('');
console.log('Cole o conteúdo em /admin/importar → aba Questões. Lotes menores dão feedback');
console.log('de erro mais cedo; prova.md serve se quiser tudo numa tacada.');

// ──── O que exige trabalho manual ────
// Impresso por último e sempre. É a única parte que o pipeline não resolve, e a
// razão de ele existir separado: figura e grade de tabela não passam pelo
// markdown do admin, então precisam voltar para o usuário nomeadas uma a uma.

const manual = comImagem.length + comTabela.length;
console.log('');
console.log('══════════════════════════════════════════════════════════════════════');
if (manual === 0) {
  console.log(' NADA A INSERIR MANUALMENTE — nenhuma questão tem imagem ou tabela.');
  console.log('══════════════════════════════════════════════════════════════════════');
} else {
  console.log(` INSERIR MANUALMENTE DEPOIS DE IMPORTAR — ${manual} questão(ões)`);
  console.log('══════════════════════════════════════════════════════════════════════');
  if (comImagem.length > 0) {
    const embutidas = comImagem.filter((i) => i.imagem_embutida).length;
    console.log('');
    console.log(` IMAGENS (${comImagem.length}) — anexe em /admin/questoes:`);
    console.log(
      embutidas === comImagem.length
        ? ' todas estão embutidas no PDF e podem ser extraídas.'
        : `${embutidas} embutida(s) no PDF; nas outras a figura foi descartada pelo gerador` +
          ' do relatório e precisa vir da fonte original.',
    );
    for (const i of comImagem) {
      console.log('');
      console.log(`   Q${String(i.numero).padStart(3, '0')}  gabarito ${i.letra.toUpperCase()}  p.${i.paginas.join(',')}${i.imagem_embutida ? '  ← ESTÁ NO PDF, dá para extrair' : ''}`);
      console.log(`     busque por: "${trechoParaBusca(i, 70)}"`);
      for (const s of i.sinais_imagem) console.log(`     sinal: ${s}`);
    }
    if (comImagem.some((i) => i.imagem_embutida)) {
      console.log('');
      console.log(' Para as marcadas "ESTÁ NO PDF", extraia os arquivos com:');
      console.log(`   node ${join(import.meta.dirname, 'extrair-imagens.mjs')} ${dir}`);
    }
  }
  if (comTabela.length > 0) {
    console.log('');
    console.log(` TABELAS (${comTabela.length}) — não convertidas em texto; remonte em /admin/questoes:`);
    for (const i of comTabela) {
      console.log('');
      console.log(`   Q${String(i.numero).padStart(3, '0')}  gabarito ${i.letra.toUpperCase()}  p.${i.paginas.join(',')}`);
      console.log(`     busque por: "${trechoParaBusca(i, 70)}"`);
      console.log(`     ${i.tabelas_substituidas > 0 ? `${i.tabelas_substituidas} bloco(s) substituído(s) por placeholder` : 'só menção no texto — confira se há grade a remontar'}`);
    }
  }
  console.log('');
  console.log(' Detalhe completo (com o conteúdo removido) em saida/PENDENCIAS.md');
  console.log('══════════════════════════════════════════════════════════════════════');
}

console.log('');
console.log(`próximo: node ${join(import.meta.dirname, 'verificar-roundtrip.mjs')} ${dir}`);

// ──── Helpers ────

/**
 * Monta o item final aplicando a revisão manual campo a campo. Só sobrescreve o
 * que a revisão trouxe — campo ausente mantém o valor validado.
 */
function montar(q, revisao) {
  const r = revisao ?? {};

  const alternativas = { ...q.alternativas, ...(r.alternativas ?? {}) };
  for (const letra of Object.keys(alternativas)) {
    alternativas[letra] = colapsar(alternativas[letra] ?? '');
    if (!alternativas[letra]) delete alternativas[letra];
  }

  // A tabela é retirada aqui, não na extração: `questoes.json` guarda a prova
  // como ela é, e a substituição por placeholder é decisão da geração.
  const apoioBruto = r.enunciado_apoio ?? q.enunciado_apoio ?? '';
  const enunciadoBruto = r.enunciado ?? q.enunciado ?? '';
  const apoio = substituirTabelas(apoioBruto);
  const enunciado = substituirTabelas(enunciadoBruto);

  return {
    numero: q.numero,
    paginas: q.paginas ?? [],
    letra: (r.letra_oficial ?? q.letra_oficial ?? '').toLowerCase(),
    enunciado: colapsarParagrafos(enunciado.texto),
    enunciado_apoio: colapsarParagrafos(apoio.texto),
    alternativas,
    explicacao: r.explicacao ?? q.explicacao ?? null,
    referencia: r.referencia ?? q.referencia ?? null,
    tem_imagem: r.tem_imagem ?? q.tem_imagem ?? false,
    tem_tabela: q.tem_tabela ?? false,
    imagem_embutida: q.imagem_embutida ?? false,
    sinais_imagem: q.sinais_imagem ?? [],
    sinais_tabela: q.sinais_tabela ?? [],
    blocos_tabulares: q.blocos_tabulares ?? [],
    tabelas_substituidas: apoio.substituidos + enunciado.substituidos,
    fonte: q.fonte_original
      ? `${o.fonte} — Q${String(q.numero).padStart(3, '0')} (${q.fonte_original})`
      : `${o.fonte} — Q${String(q.numero).padStart(3, '0')}`,
  };
}

/**
 * Preserva os parágrafos do conteúdo, mas nunca deixa uma linha começar com um
 * rótulo do parser: essas linhas são grudadas na anterior. O texto é mantido na
 * íntegra — só a posição da quebra de linha muda.
 */
function proteger(texto) {
  const linhas = String(texto).split('\n');
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
  return RESERVADO.test(String(texto).split('\n')[0] ?? '');
}

/** Uma linha por parágrafo; o parser do admin descarta linhas em branco. */
function colapsarParagrafos(texto) {
  return String(texto ?? '')
    .split(/\n{2,}/)
    .map((par) => colapsar(par))
    .filter(Boolean)
    .join('\n');
}

/**
 * Trecho para localizar a questão no `/admin/questoes`.
 *
 * Usa o começo do texto de apoio, não a pergunta: perguntas de prova são
 * genéricas e se repetem ("assinale a alternativa correta"), enquanto o começo
 * do caso clínico é praticamente único na prova.
 */
function trechoParaBusca(item, max = 60) {
  const base = colapsar(item.enunciado_apoio) || colapsar(item.enunciado);
  if (base.length <= max) return base;
  const bruto = base.slice(0, max);
  const corte = bruto.lastIndexOf(' ');
  return corte > max * 0.6 ? bruto.slice(0, corte) : bruto;
}
