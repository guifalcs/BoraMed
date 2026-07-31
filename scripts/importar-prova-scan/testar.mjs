#!/usr/bin/env node
/**
 * Testes do pipeline de importação de provas digitalizadas.
 *
 * Cobre o que não pode regredir: a discriminação do cruzamento, a costura de
 * questões partidas entre páginas e a detecção dos erros que o pipeline existe
 * para pegar.
 *
 * Uso: node scripts/importar-prova-scan/testar.mjs
 */

import { similaridade, similaridadeVocabulario, compararCampo, desdobrar, diffPalavras } from './lib/texto.mjs';
import { costurar } from './lib/transcricao.mjs';
import { resolverGabarito } from './lib/gabarito.mjs';

let passou = 0;
const falhas = [];

function ok(nome, condicao, detalhe = '') {
  if (condicao) { passou += 1; return; }
  falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

function quase(nome, valor, esperado, tol = 0.001) {
  ok(nome, Math.abs(valor - esperado) <= tol, `esperado ${esperado}, obtido ${valor}`);
}

// ──── Cruzamento: discriminação entre alternativas parecidas ────

const comentarioQ1 =
  'A laparotomia exploradora é a intervenção cirúrgica de emergência indicada para pacientes ' +
  'com sinais de peritonite generalizada, como no caso descrito.';

quase('correta casa com o comentário', similaridade('Laparotomia exploradora.', comentarioQ1), 1);
quase('distrator lexicalmente próximo não casa', similaridade('Laparoscopia diagnóstica.', comentarioQ1), 0);
quase('OCR corrompido não casa', similaridade('Laparotomla explaradora.', comentarioQ1), 0);

// O motivo de existir bigrama: em prova médica as alternativas diferem por uma
// palavra, e saco de palavras dá 1.0 para todas.
const leucemias = 'Trata-se de Leucemia Linfoide Aguda, e não de Leucemia Mieloide Aguda.';
const simCerta = similaridade('Leucemia Linfoide Aguda.', leucemias);
const simErrada = similaridade('Leucemia Mieloide Crônica.', leucemias);
quase('bigrama confirma a correta', simCerta, 1);
// O que importa é a margem: o validador só grita "gabarito_contradito" quando o
// distrator supera a correta em mais de DUVIDA (0.34).
ok(
  'bigrama dá margem entre Linfoide e Mieloide',
  simCerta - simErrada > 0.34,
  `correta ${simCerta} vs distrator ${simErrada}`,
);
ok(
  'vocabulário NÃO distingue (por isso não decide gabarito)',
  similaridadeVocabulario('Leucemia Mieloide Crônica.', leucemias) > 0.6,
  `obtido ${similaridadeVocabulario('Leucemia Mieloide Crônica.', leucemias)}`,
);

// Vocabulário é a rede contra corrupção: reescrita mantém, OCR quebrado não.
ok(
  'vocabulário sobrevive a reescrita',
  similaridadeVocabulario('peritonite generalizada difusa', comentarioQ1) >= 0.6,
);
quase('vocabulário zera com OCR corrompido', similaridadeVocabulario('Laparotomla explaradora.', comentarioQ1), 0);

// ──── Resolução do gabarito: devolutiva acima da folha ────

const LIM = { confirma: 0.6, duvida: 0.34 };
const alts = {
  a: 'Estágio de ação – Encaminhamento imediato para internação.',
  b: 'Estágio de manutenção – Prescrição de naltrexona.',
  d: 'Estágio de contemplação – Abordagem motivacional auxiliando na elaboração de um plano de ação.',
};

// 1. Sem nada declarado na devolutiva, vale a folha.
const soFolha = resolverGabarito('D', { declarado: { letra: null, afirmacao: null } }, alts, LIM);
ok('sem devolutiva vale a folha', soFolha.letra === 'D' && soFolha.origem === 'folha');
ok('folha sozinha não conta como divergência', soFolha.divergiu === false);

// 2. Devolutiva nomeia a letra, sem texto aproveitável: a letra decide.
const porLetra = resolverGabarito('B', { declarado: { letra: 'A', afirmacao: null } }, alts, LIM);
ok('letra da devolutiva vence a folha', porLetra.letra === 'A', `obtido ${porLetra.letra}`);
ok('origem é devolutiva_letra', porLetra.origem === 'devolutiva_letra');
ok('divergência é registrada', porLetra.divergiu === true);

// ── Casos reais da TPI 2025.1 que expuseram bugs na resolução ──

// Q93: a devolutiva diz "letra A" mas o texto que ela dá ("de esforço") é a
// alternativa B — a mesma da folha. O texto tem que ganhar da letra, senão o
// gabarito é trocado para a alternativa errada.
const q93 = resolverGabarito(
  'B',
  {
    declarado: {
      letra: 'A',
      afirmacao: 'letra A, por Incontinência urinária de esforço, devido achados como perda involuntária de urina ao realizar esforços',
    },
  },
  {
    a: 'Incontinência urinária de urgência',
    b: 'Incontinência urinária de esforço',
    c: 'Incontinência urinária funcional',
    d: 'Incontinência urinária mista',
    e: 'Infecção do trato urinário de repetição',
  },
  LIM,
);
ok('Q93: texto vence a letra declarada', q93.letra === 'B', `obtido ${q93.letra}`);
ok('Q93: não troca o gabarito da folha', q93.divergiu === false);
ok('Q93: conflito texto×letra é registrado', q93.conflito?.letra_declarada === 'A');

// Q11: a janela declarada atravessa para a lista de distratores
// ("ALTERNATIVA: … Incorreta: …"). Sem recortar, o gabarito era trocado para
// uma alternativa explicitamente marcada como incorreta.
const q11 = resolverGabarito(
  'D',
  {
    declarado: {
      letra: null,
      afirmacao: 'A ressecção do mioma por essa técnica apresenta taxa de sucesso de até 90% e aumenta as taxas de fertilidade. ALTERNATIVA: Embolização das artérias uterinas. Incorreta: O procedimento está associado à complicações',
    },
  },
  {
    a: 'Ablação endometrial.',
    b: 'Agonistas do GnRH',
    c: 'Embolização das artérias uterinas',
    d: 'Miomectomia histeroscópica',
    e: 'Anticoncepcional oral combinado.',
  },
  LIM,
);
ok('Q11: não troca para distrator citado depois do recorte', q11.letra === 'D', `obtido ${q11.letra}`);
ok('Q11: mantém a folha', q11.origem === 'folha' && q11.divergiu === false);

// 3. Devolutiva nomeia a letra sem transcrição alguma: decide igual.
const semAlts = resolverGabarito('B', { declarado: { letra: 'A', afirmacao: null } }, {}, LIM);
ok('letra declarada decide sem depender do scan', semAlts.letra === 'A');

// 4. Devolutiva transcreve a resposta e ela está na posição "d": vale d.
const porTexto = resolverGabarito(
  'A',
  { declarado: { letra: null, afirmacao: 'Estágio de contemplação – Abordagem motivacional auxiliando na elaboração de um plano de ação.' } },
  alts,
  LIM,
);
ok('texto da devolutiva aponta a alternativa certa', porTexto.letra === 'D', `obtido ${porTexto.letra}`);
ok('origem é devolutiva_texto', porTexto.origem === 'devolutiva_texto');
ok('troca por texto é registrada como divergência', porTexto.divergiu === true);

// 5. Texto declarado que não é alternativa nenhuma (a devolutiva explica em vez
//    de citar): não há margem, cai na folha em vez de chutar.
const semMargem = resolverGabarito(
  'D',
  { declarado: { letra: null, afirmacao: 'A ressecção do mioma apresenta taxa de sucesso de até 90%.' } },
  alts,
  LIM,
);
ok('sem casamento cai de volta na folha', semMargem.letra === 'D' && semMargem.origem === 'folha');

// 6. Empate entre alternativas parecidas não decide.
const empate = resolverGabarito(
  'A',
  { declarado: { letra: null, afirmacao: 'Estágio de contemplação' } },
  { a: 'Estágio de contemplação – abordagem X.', b: 'Estágio de contemplação – abordagem Y.' },
  LIM,
);
ok('empate não troca o gabarito', empate.origem === 'folha', `origem ${empate.origem}`);

// ──── Consenso entre passes ────

ok('idêntico', compararCampo('Dor abdominal.', 'Dor abdominal.') === 'identico');
ok('só espaçamento é idêntico', compararCampo('Dor  abdominal.', 'Dor abdominal.') === 'identico');
ok('acento perdido é equivalente', compararCampo('Dor abdominal.', 'Dor abdominal') === 'equivalente');
ok('palavra trocada é divergente', compararCampo('Dor abdominal.', 'Dor torácica.') === 'divergente');
ok('diff aponta a troca', diffPalavras('Dor abdominal.', 'Dor torácica.').includes('[-abdominal.-]'));

// ──── Costura de questão partida entre páginas ────

const paginas = [
  {
    pagina_pdf: 2,
    questoes: [{
      numero: 5, peso: '0.09', fonte_original: 'UNIMA',
      enunciado_apoio: 'Uma gestante de 25 anos.', enunciado: 'Qual a conduta?',
      alternativas: {}, continua_na_proxima: true,
    }],
  },
  {
    pagina_pdf: 3,
    questoes: [
      {
        numero: null, continua_da_anterior: true,
        enunciado_apoio: '', enunciado: '',
        alternativas: { a: 'Penicilina benzatina.', b: 'Penicilina cristalina.' },
      },
      {
        numero: 6, peso: '0.09', enunciado_apoio: 'Gestante primigesta.',
        enunciado: 'Qual o traçado?', alternativas: { a: 'Normal.', b: 'Anormal.' },
        tem_imagem: true,
      },
    ],
  },
];

const { questoes, erros } = costurar(paginas);
ok('costura sem erro', erros.length === 0, erros.join('; '));
ok('fragmento sem número herda a questão anterior', questoes.has(5));
ok('alternativas da página seguinte entram na questão 5', Object.keys(questoes.get(5).alternativas).length === 2);
ok('questão 5 marcada como costurada', questoes.get(5).costurada === true);
ok('questão 5 registra as duas páginas', questoes.get(5).paginas.join(',') === '2,3');
ok('questão 6 fica separada', questoes.get(6)?.alternativas.b === 'Anormal.');
ok('imagem detectada na questão 6', questoes.get(6)?.tem_imagem === true);

// Alternativa partida ao meio pela quebra de página vira uma só, marcada.
const partida = costurar([
  {
    pagina_pdf: 4,
    questoes: [{ numero: 7, enunciado: 'Q?', alternativas: { c: 'Normal, pois apresenta variabilidade entre 5 e' } }],
  },
  {
    pagina_pdf: 5,
    questoes: [{ numero: null, continua_da_anterior: true, alternativas: { c: '25 bpm por mais de 50 minutos.' } }],
  },
]);
ok(
  'alternativa partida é remontada',
  partida.questoes.get(7).alternativas.c === 'Normal, pois apresenta variabilidade entre 5 e 25 bpm por mais de 50 minutos.',
);
ok('remontagem de alternativa é sinalizada', partida.questoes.get(7).alternativas_costuradas.includes('c'));

// Lacuna na numeração tem que ser erro — significa página não transcrita.
const lacuna = costurar([
  { pagina_pdf: 1, questoes: [{ numero: 1, alternativas: {} }] },
  { pagina_pdf: 2, questoes: [{ numero: 4, alternativas: {} }] },
]);
ok('lacuna na numeração é erro', lacuna.erros.some((e) => e.includes('lacuna')));

// ──── Desdobramento do texto do PDF ────

const desdobrado = desdobrar('A dor abdominal é\nintensa e difusa, com\nsinais de peritonite.\n\nFonte: SBCD.');
ok('linhas de um parágrafo são juntadas', desdobrado.split('\n\n')[0].includes('é intensa e difusa'));
ok('parágrafos são preservados', desdobrado.split('\n\n').length === 2);
ok('hifenização de fim de linha é resolvida', desdobrar('hipo-\nhidratado').includes('hipohidratado'));
ok(
  'enumeração I./II. não é grudada',
  desdobrar('Analise:\nI. Primeira.\nII. Segunda.').split('\n\n').length === 3,
);

// ──── Veredito ────

console.log(`${passou} verificações passaram`);
if (falhas.length > 0) {
  console.error(`\n✗ ${falhas.length} falha(s):`);
  falhas.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
}
console.log('✓ todos os testes passaram');
