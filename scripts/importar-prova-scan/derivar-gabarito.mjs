#!/usr/bin/env node
/**
 * Fecha o ciclo do gabarito quando nenhum dos dois PDFs de origem trouxe uma
 * folha oficial extraível (ver `extrair-duas-fontes.mjs`) — caso de TPI
 * 2025.2, onde a prova fotografada do aluno usa um **caderno com a ordem das
 * questões embaralhada** em relação ao "CADERNO 001" que a devolutiva
 * descreve. A questão 2 do caderno do aluno pode ser, em conteúdo, a questão
 * 47 da devolutiva — mesmo texto, número diferente.
 *
 * Duas fases, ambas determinísticas (zero IA):
 *
 *   FASE A — remapeamento por conteúdo. Para cada questão transcrita do
 *   scan, mede o quanto o texto das suas alternativas aparece (containment
 *   de bigramas) no comentário de cada uma das 120 questões da devolutiva, e
 *   resolve a correspondência 1:1 por atribuição gulosa pelo maior escore.
 *   Perguntas de prova médica têm vocabulário muito específico por questão
 *   ("critérios de Roma IV", "síndrome de Turner" etc.), então o par certo
 *   tende a vencer por larga margem — a distância entre o 1º e o 2º colocado
 *   é o sinal de confiança.
 *
 *   FASE B — dentro do par já resolvido, deriva a letra correta comparando
 *   o texto das alternativas do scan contra o veredito da devolutiva
 *   ("Alternativa correta:" quando existe, ou segmentação por
 *   "Correta"/"Incorreta" quando a devolutiva comenta alternativa por
 *   alternativa dentro de um único parágrafo).
 *
 * Nenhuma das duas fases resolve por chute: par ou letra sem vencedor único
 * e confiante fica pendente para revisão manual.
 *
 * Efeitos colaterais em `<dir>`:
 *   - devolutiva-original-caderno.json  (backup da devolutiva como veio do PDF)
 *   - devolutiva.json                   (reescrito, chaveado pela numeração do scan)
 *   - gabarito.json                     (letra por questão, chaveado pela numeração do scan)
 *   - mapeamento-caderno.json           (scanNum -> {devNum, escore, folga})
 *   - gabarito-derivado-relatorio.md
 *
 * Uso: node derivar-gabarito.mjs <dir-trabalho> [--limiar-afirmacao 0.5] [--limiar-segmento 0.4] [--limiar-mapa 0.12]
 */

import { existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerJson } from './lib/pdf.mjs';
import { carregarPasse, costurar } from './lib/transcricao.mjs';
import { similaridade, similaridadeVocabulario } from './lib/texto.mjs';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const opt = (nome, padrao) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? Number(argv[i + 1]) : padrao;
};

if (!dir) {
  console.error('uso: node derivar-gabarito.mjs <dir-trabalho> [--limiar-afirmacao 0.5] [--limiar-segmento 0.4] [--limiar-mapa 0.12]');
  process.exit(2);
}
if (!existsSync(dir)) {
  console.error(`diretório não encontrado: ${dir}`);
  process.exit(2);
}

const LIMIAR_AFIRMACAO = opt('limiar-afirmacao', 0.5);
const LIMIAR_SEGMENTO = opt('limiar-segmento', 0.4);
const LIMIAR_MAPA = opt('limiar-mapa', 0.13);

const manifesto = lerJson(join(dir, 'manifesto.json'));
const gabaritoAtual = lerJson(join(dir, 'gabarito.json')) ?? {};

const backupDevolutiva = join(dir, 'devolutiva-original-caderno.json');
const devolutivaOriginal = existsSync(backupDevolutiva)
  ? lerJson(backupDevolutiva)
  : lerJson(join(dir, 'devolutiva.json'));

if (!devolutivaOriginal) {
  console.error('devolutiva.json não encontrado — rode a extração primeiro');
  process.exit(2);
}
if (Object.keys(gabaritoAtual).length > 0) {
  console.error(
    `gabarito.json já tem ${Object.keys(gabaritoAtual).length} questões — este script é só para o caso de ` +
    'gabarito totalmente ausente. Não sobrescreve uma folha oficial existente.',
  );
  process.exit(2);
}
if (!existsSync(backupDevolutiva)) {
  copyFileSync(join(dir, 'devolutiva.json'), backupDevolutiva);
}

const paginasEsperadas = manifesto?.secoes_scan?.scan ?? [];
const { paginas, erros: errosContrato } = carregarPasse(join(dir, 'transcricao', 'passe1'), paginasEsperadas);
if (errosContrato.length > 0) {
  console.error('transcrição com erros de contrato — resolva antes de derivar o gabarito:');
  errosContrato.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
}
const { questoes, erros: errosCostura } = costurar(paginas);
if (errosCostura.length > 0) {
  console.error('transcrição com erros de costura — resolva antes de derivar o gabarito:');
  errosCostura.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
}

// ──── FASE A — remapeamento scanNum → devNum por conteúdo ────

const scanNumeros = [...questoes.keys()].sort((a, b) => a - b);
const devNumeros = Object.keys(devolutivaOriginal).map(Number).sort((a, b) => a - b);

// Agulha = todo o texto da questão do lado do scan (caso clínico + pergunta
// + as 5 alternativas). Incluir o caso ajuda quando a devolutiva o
// reaproveita, mas dilui o sinal quando ela não o faz — por isso o escore
// final combina containment estrito de bigramas (`similaridade`, robusto a
// coincidência de vocabulário genérico) com containment de vocabulário em
// janela deslizante (`similaridadeVocabulario`, robusto a paráfrase). Exigir
// pelo menos 1 bigrama em comum antes de considerar o par elimina a maior
// fonte de falso positivo observada: candidatos que só colidem em
// vocabulário médico genérico, sem nenhuma frase realmente compartilhada.
const agulhaPorScan = new Map();
for (const n of scanNumeros) {
  const q = questoes.get(n);
  agulhaPorScan.set(n, [q.enunciado_apoio, q.enunciado, ...Object.values(q.alternativas)].filter(Boolean).join(' '));
}
const candidatoPorDev = new Map();
for (const n of devNumeros) {
  const dev = devolutivaOriginal[String(n)];
  candidatoPorDev.set(n, [dev.comentario, dev.distratores].filter(Boolean).join(' '));
}

// Todos os pares com escore, ordenados do melhor para o pior — atribuição
// gulosa: cada par só é aceito se nem a questão do scan nem a da devolutiva
// já tiverem sido usadas.
const pares = [];
for (const sn of scanNumeros) {
  const agulha = agulhaPorScan.get(sn);
  for (const dn of devNumeros) {
    const texto = candidatoPorDev.get(dn);
    const bigramas = similaridade(agulha, texto);
    if (bigramas === 0) continue;
    const vocabulario = similaridadeVocabulario(agulha, texto);
    pares.push({ sn, dn, escore: Number(((bigramas + vocabulario) / 2).toFixed(3)) });
  }
}
pares.sort((a, b) => b.escore - a.escore);

const scanUsado = new Set();
const devUsado = new Set();
const mapa = new Map(); // scanNum -> { dn, escore }
for (const p of pares) {
  if (scanUsado.has(p.sn) || devUsado.has(p.dn)) continue;
  mapa.set(p.sn, { dn: p.dn, escore: p.escore });
  scanUsado.add(p.sn);
  devUsado.add(p.dn);
}
// Sobras (escore 0 com todo mundo, ou algum lado ficou sem par): força o que
// restar em qualquer ordem — fica com escore 0 e cai para revisão manual.
const scanSobrando = scanNumeros.filter((n) => !scanUsado.has(n));
const devSobrando = devNumeros.filter((n) => !devUsado.has(n));
scanSobrando.forEach((sn, i) => {
  if (devSobrando[i] !== undefined) mapa.set(sn, { dn: devSobrando[i], escore: 0 });
});

// Folga = distância entre o par escolhido e o segundo melhor candidato do
// mesmo lado — par com pouca folga é ambíguo mesmo com escore bom.
function segundoMelhorParaScan(sn, dnEscolhido) {
  let melhor = 0;
  const agulha = agulhaPorScan.get(sn);
  for (const dn of devNumeros) {
    if (dn === dnEscolhido) continue;
    const texto = candidatoPorDev.get(dn);
    const bigramas = similaridade(agulha, texto);
    if (bigramas === 0) continue;
    const vocabulario = similaridadeVocabulario(agulha, texto);
    const escore = (bigramas + vocabulario) / 2;
    if (escore > melhor) melhor = escore;
  }
  return melhor;
}

const mapeamentoRelatorio = [];
for (const sn of scanNumeros) {
  const m = mapa.get(sn);
  const segundo = segundoMelhorParaScan(sn, m.dn);
  const folga = Number((m.escore - segundo).toFixed(3));
  // Só o piso de escore decide "resolvida vs. pendente" — a folga entra no
  // relatório para o revisor, mas não filtra sozinha: pares corretos
  // confirmados manualmente apareceram com folga tão baixa quanto 0.03.
  const confiavel = m.escore >= LIMIAR_MAPA;
  mapeamentoRelatorio.push({ scanNum: sn, devNum: m.dn, escore: m.escore, folga, confiavel });
}

writeFileSync(
  join(dir, 'mapeamento-caderno.json'),
  JSON.stringify(Object.fromEntries(mapeamentoRelatorio.map((r) => [r.scanNum, r])), null, 2) + '\n',
  'utf-8',
);

const mapaConfiavel = mapeamentoRelatorio.filter((r) => r.confiavel).length;
console.log(`remapeamento de caderno: ${mapaConfiavel} / ${scanNumeros.length} pares com confiança alta`);

// Devolutiva reescrita com a numeração do scan — mantida mesmo para pares de
// baixa confiança (a devolutiva errada é melhor que nenhuma para revisão
// manual; o relatório sinaliza qual delas desconfiar).
const devolutivaRemapeada = {};
for (const r of mapeamentoRelatorio) {
  devolutivaRemapeada[String(r.scanNum)] = devolutivaOriginal[String(r.devNum)];
}
writeFileSync(join(dir, 'devolutiva.json'), JSON.stringify(devolutivaRemapeada, null, 2) + '\n', 'utf-8');

// ──── FASE B — letra correta dentro de cada par já resolvido ────

function segmentarVeredito(texto) {
  const marcador = /\b(in)?correta\b\.?/gi;
  const segmentos = [];
  let prev = 0;
  let m;
  while ((m = marcador.exec(texto)) !== null) {
    segmentos.push({ texto: texto.slice(prev, m.index + m[0].length), positivo: !m[1] });
    prev = m.index + m[0].length;
  }
  return segmentos;
}

function melhorSegmento(altTexto, segmentos) {
  let melhor = null;
  for (const s of segmentos) {
    const score = similaridade(altTexto, s.texto);
    if (!melhor || score > melhor.score) melhor = { score, positivo: s.positivo };
  }
  return melhor;
}

function derivarLetra(alternativas, dev) {
  const letras = Object.keys(alternativas);
  if (letras.length < 2) return { erro: 'menos de 2 alternativas transcritas' };

  if (dev.declarado?.afirmacao) {
    let melhor = null;
    let empatou = false;
    for (const letra of letras) {
      const score = similaridade(dev.declarado.afirmacao, alternativas[letra]);
      if (!melhor || score > melhor.score) { melhor = { letra, score }; empatou = false; }
      else if (score === melhor.score) empatou = true;
    }
    if (melhor && !empatou && melhor.score >= LIMIAR_AFIRMACAO) {
      return { letra: melhor.letra.toUpperCase(), confianca: melhor.score, metodo: 'afirmacao' };
    }
  }

  const segmentos = segmentarVeredito(dev.bruto ?? '');
  if (segmentos.length >= 1) {
    const candidatos = letras
      .map((letra) => {
        const m = melhorSegmento(alternativas[letra], segmentos);
        return m && { letra, ...m };
      })
      .filter(Boolean);
    const positivos = candidatos.filter((c) => c.positivo && c.score >= LIMIAR_SEGMENTO);
    if (positivos.length === 1) {
      return { letra: positivos[0].letra.toUpperCase(), confianca: positivos[0].score, metodo: 'segmento' };
    }
    if (positivos.length > 1) {
      return { erro: `ambíguo — segmento positivo bate com ${positivos.map((p) => p.letra).join(', ')}` };
    }
  }

  // ── sinal 3: declaração narrativa ("X é a única correta, pois...") ──
  // Nem sempre a devolutiva usa um marcador líder nem comenta alternativa
  // por alternativa dentro de um parágrafo só — às vezes nomeia o tema da
  // resposta certa no meio de uma frase antes de "é a única correta". Extrai
  // essa frase inteira e casa contra as alternativas, como no sinal 1.
  const frase = (dev.bruto ?? '').match(
    /([^\n]{0,220}?\bé\s+a\s+(?:única\s+)?(?:alternativa\s+)?correta\b)/i,
  )?.[1];
  if (frase) {
    let melhor = null;
    let empatou = false;
    for (const letra of letras) {
      const score = similaridade(frase, alternativas[letra]);
      if (!melhor || score > melhor.score) { melhor = { letra, score }; empatou = false; }
      else if (score === melhor.score) empatou = true;
    }
    if (melhor && !empatou && melhor.score >= LIMIAR_AFIRMACAO) {
      return { letra: melhor.letra.toUpperCase(), confianca: melhor.score, metodo: 'narrativo' };
    }
  }

  return { erro: 'nenhum sinal produziu vencedor único e confiante' };
}

const gabaritoDerivado = {};
const relatorioGabarito = [];
let resolvidas = 0;

for (const r of mapeamentoRelatorio) {
  const q = questoes.get(r.scanNum);
  const dev = devolutivaRemapeada[String(r.scanNum)];
  if (!r.confiavel) {
    relatorioGabarito.push({ numero: r.scanNum, status: 'pendente', motivo: `mapeamento de caderno incerto (dev. ${r.devNum}, escore ${r.escore}, folga ${r.folga})` });
    continue;
  }
  const resultado = derivarLetra(q.alternativas, dev);
  if (resultado.letra) {
    gabaritoDerivado[String(r.scanNum)] = resultado.letra;
    resolvidas += 1;
    relatorioGabarito.push({ numero: r.scanNum, status: 'resolvida', devNum: r.devNum, ...resultado });
  } else {
    relatorioGabarito.push({ numero: r.scanNum, status: 'pendente', devNum: r.devNum, motivo: resultado.erro });
  }
}

writeFileSync(join(dir, 'gabarito.json'), JSON.stringify(gabaritoDerivado, null, 2) + '\n', 'utf-8');

const pendentes = relatorioGabarito.filter((r) => r.status !== 'resolvida');
const md = [];
md.push('# Derivação de gabarito — TPI sem folha oficial, caderno embaralhado\n');
md.push(
  'Nenhum dos dois PDFs de origem trouxe uma folha de gabarito oficial extraível, e a ' +
  'ordem das questões no caderno do aluno (scan) não bate com o "CADERNO 001" que a ' +
  'devolutiva descreve — cadernos diferentes parecem sortear de um banco de itens maior, ' +
  'não só reordenar as mesmas 120 questões. Este relatório cobre as duas etapas derivadas ' +
  '— nenhuma delas é uma fonte independente.\n\n' +
  '**Toda linha aqui, inclusive as marcadas "resolvida", é inferência por comparação de ' +
  'texto e precisa de conferência manual antes de aceitar.** Na calibração deste lote, ' +
  'a checagem manual de ~18 pares encontrou 1 falso positivo com escore alto (0.181) — ' +
  'confie no conteúdo, não só no número.\n',
);
md.push(`- pares questão-do-scan ↔ questão-da-devolutiva remapeados com confiança: **${mapaConfiavel}** / ${scanNumeros.length}`);
md.push(`- letras derivadas com confiança: **${resolvidas}** / ${scanNumeros.length}`);
md.push(`- pendentes (gabarito ausente, requer leitura manual): **${pendentes.length}**\n`);

md.push('## Mapeamento de caderno — todos os pares, do menos confiável ao mais\n');
md.push('| questão (scan) | questão (devolutiva) | escore | folga | confiável |');
md.push('| --- | --- | --- | --- | --- |');
for (const r of [...mapeamentoRelatorio].sort((a, b) => a.escore - b.escore)) {
  md.push(`| ${r.scanNum} | ${r.devNum} | ${r.escore.toFixed(3)} | ${r.folga.toFixed(3)} | ${r.confiavel ? 'sim' : 'NÃO'} |`);
}

if (pendentes.length > 0) {
  md.push('\n## Pendentes (gabarito)\n');
  md.push('| questão | motivo |');
  md.push('| --- | --- |');
  for (const p of pendentes) md.push(`| ${p.numero} | ${p.motivo} |`);
}

md.push('\n## Letras resolvidas — confira as de confiança mais baixa\n');
md.push('| questão (scan) | questão (devolutiva) | letra | método | confiança |');
md.push('| --- | --- | --- | --- | --- |');
for (const r of relatorioGabarito.filter((r) => r.status === 'resolvida').sort((a, b) => a.confianca - b.confianca)) {
  md.push(`| ${r.numero} | ${r.devNum} | ${r.letra} | ${r.metodo} | ${r.confianca.toFixed(3)} |`);
}
writeFileSync(join(dir, 'gabarito-derivado-relatorio.md'), md.join('\n') + '\n', 'utf-8');

console.log(`gabarito derivado: ${resolvidas} / ${scanNumeros.length} questões`);
console.log(`pendentes (sem gabarito): ${pendentes.length}`);
if (pendentes.length > 0) console.log(`  ${pendentes.map((p) => p.numero).join(', ')}`);
console.log(`\nrelatório completo em ${join(dir, 'gabarito-derivado-relatorio.md')}`);
console.log('próximo passo: node validar.mjs <dir>');
