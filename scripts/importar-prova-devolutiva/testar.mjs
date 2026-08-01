#!/usr/bin/env node
/**
 * Testes do pipeline de importação do relatório de devolutiva.
 *
 * Cobre o que não pode regredir: os defeitos reais que as provas de calibração
 * revelaram — três Integradoras, cinco SOI e quatro HAM. Cada bloco abaixo
 * corresponde a um bug que já aconteceu e passou em silêncio; é essa a razão de
 * o teste existir, não cobertura por cobertura.
 *
 * Uso: node scripts/importar-prova-devolutiva/testar.mjs
 */

import {
  normalizarTipografia,
  paragrafosSuspeitos,
  dividirEnunciado,
  fatiarQuestoes,
  parsearQuestao,
  cabecalhoDaProva,
  classificarFormato,
  ehLayoutDeDuasColunas,
} from './lib/relatorio.mjs';
import {
  ehQuestaoDeAssertivas,
  cruzamentoDeAssertivas,
  crivoCruzamento,
  crivoEstrutura,
  crivoDiscursiva,
  RESERVADO,
} from './lib/crivos.mjs';
import { mencoesDeFigura, mencoesDeTabela, linhasTabulares, substituirTabelas } from './lib/midia.mjs';

let passou = 0;
const falhas = [];

function ok(nome, condicao, detalhe = '') {
  if (condicao) { passou += 1; return; }
  falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

function igual(nome, obtido, esperado) {
  ok(nome, obtido === esperado, `esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
}

// ─────────────────── tipografia ───────────────────
// A prova traz ligadura, acento decomposto, espaço antes de marca combinante e
// `i` sem pingo acentuado. Nada disso aparece a olho nu e tudo quebra busca.

igual('ligadura fi expande', normalizarTipografia('ﬁsiopatológico'), 'fisiopatológico');
igual('ligadura fl expande', normalizarTipografia('inﬂamação'), 'inflamação');
igual(
  'acento decomposto compõe',
  normalizarTipografia('ação').normalize('NFC'),
  'ação',
);
igual('espaço antes da marca combinante some', normalizarTipografia('ilı ́aca'), 'ilíaca');
igual('i sem pingo acentuado vira í', normalizarTipografia('lı́quido'), 'líquido');
ok(
  'superescrito clínico preservado (não é NFKC)',
  normalizarTipografia('Na⁺/K⁺/2Cl⁻ e µg').includes('Na⁺/K⁺/2Cl⁻'),
);

// ─────────────────── camada de texto embaralhada ───────────────────
// Parágrafo real da questão 46. `dnáuseasas` perdeu caractere de verdade: não
// tem reparo mecânico, só detecção.

const CORROMPIDO =
  'A dor na apendicite é localizada na regiã o epigá strica ou periumbilical, quase sempre ' +
  'acompanhada dnáuseasas e vô mitos. Algumas horas depois migra, indicando comprometimento ' +
  'do peritô nio periapendicular. A febre nã o costuma ser elevada.';

const suspeitos = paragrafosSuspeitos(CORROMPIDO);
igual('parágrafo corrompido é detectado', suspeitos.length, 1);
igual('e classificado como certo', suspeitos[0]?.nivel, 'certo');
ok('aponta as marcas encontradas', (suspeitos[0]?.marcas ?? []).some((m) => m.startsWith('regiã')));

// Português correto com a mesma forma — a razão de o nível "fraco" existir.
igual(
  'prosa correta não dispara',
  paragrafosSuspeitos(
    'O quadro está dentro do esperado até os 12 meses, já que há sinais de evolução ' +
    'e não há cerca de nenhum achado atípico.',
  ).length,
  0,
);
igual(
  'palavra que legitimamente termina em ã não dispara',
  paragrafosSuspeitos('A irmã de manhã relatou que o avô e você passaram bem.').length,
  0,
);
// Forma verbal em `ê` é classe aberta (vê, lê, crê, prevê, provê): acusou
// indevidamente a questão 25 da 2025.1, cujo enunciado é correto.
igual(
  'forma verbal terminada em ê não é corrupção',
  paragrafosSuspeitos(
    'A enfermeira lembra da rede Alyne, que prevê mais estrutura no acompanhamento, ' +
    'e informa que a gestante está tendo sangramento há dois dias.',
  ).length,
  0,
);

// ─────────────────── marca d'água na linha do rótulo ───────────────────
// A Integradora 2024.2 traz o stamp de quem redistribuiu o PDF na margem direita
// da linha "Enunciado:", e ele entrava como primeira linha do enunciado.

const PAGINA_COM_MARCA = [
  '                                        1ª QUESTÃO',
  ' Enunciado:                                        www.acervo.top/integradora-iv ou acervotop.com/integradora-iv',
  '',
  ' (FACIMPA) Uma adolescente, de 17 anos, moradora de bairro periférico, descobriu que',
  ' estava grávida no primeiro trimestre e começou a ter sangramentos.',
  '',
  ' Considerando a situação descrita, analise as afirmativas abaixo e assinale a correta.',
  '',
  ' Alternativas:',
  ' (alternativa A) (CORRETA)',
  ' O aborto espontâneo completo é caracterizado pela expulsão de todo o conteúdo gestacional.',
  '',
  ' (alternativa B)',
  ' O colo do útero permanece aberto após a expulsão completa do conteúdo gestacional.',
].join('\n');

const comMarca = parsearQuestao(fatiarQuestoes([PAGINA_COM_MARCA]).blocos[0]);
ok('marca d\'água sai do enunciado', !comMarca.enunciado_apoio.includes('acervo.top'));
ok('e não sobra em nenhum campo', !JSON.stringify(comMarca.alternativas).includes('acervo.top'));
ok('mas é reportada como aviso', comMarca.avisos.some((a) => a.includes('margem descartada')));
igual('origem volta a ser detectada depois da limpeza', comMarca.fonte_original, 'FACIMPA');
ok('apoio começa no caso clínico', comMarca.enunciado_apoio.startsWith('Uma adolescente'));

// Valor legítimo na linha do rótulo (um espaço, não um vão) continua valendo.
const semVao = parsearQuestao(fatiarQuestoes([[
  '  3ª QUESTÃO',
  ' Enunciado: Paciente de 40 anos com dor torácica típica há duas horas.',
  '',
  ' Alternativas:',
  ' (alternativa A) (CORRETA)',
  ' Solicitar eletrocardiograma imediatamente e dosar troponina sérica.',
  ' (alternativa B)',
  ' Liberar o paciente com orientação de retorno em sete dias para reavaliação.',
].join('\n')]).blocos[0]);
ok('valor colado ao rótulo é preservado', semVao.enunciado.includes('dor torácica típica'));

// ─────────────────── divisão apoio / pergunta ───────────────────

const porParagrafo = dividirEnunciado(
  'Menino de 12 meses é trazido à consulta de puericultura.\n\n' +
  'Com base nesse quadro, assinale a alternativa correta.',
);
igual('corte por parágrafo', porParagrafo.criterio, 'paragrafo');
igual('pergunta é o último parágrafo', porParagrafo.pergunta, 'Com base nesse quadro, assinale a alternativa correta.');

// 18 das 50 questões têm caso e pergunta no mesmo parágrafo, sem linha em branco.
const porFrase = dividirEnunciado(
  'A gestante refere que não buscou assistência de saúde antes, pois estava esperando as ' +
  'dores das contrações aumentarem. Analise a situação descrita e assinale a alternativa ' +
  'que indica corretamente a conduta médica.',
);
igual('corte por frase', porFrase.criterio, 'frase');
ok('pergunta começa no comando', porFrase.pergunta.startsWith('Analise a situação'));
ok('apoio guarda o caso', porFrase.apoio.includes('não buscou assistência'));

// O `\b` que fechava a regex caía entre "t" e "o" e nunca casava com "correto".
igual(
  'fechamento de assertivas é reconhecido como pergunta',
  dividirEnunciado('Sobre os sinais do abdome agudo, analise as assertivas.\n\nÉ correto o que se afirma em:').criterio,
  'paragrafo',
);
igual(
  'variante "Apenas está correta o que se afirma em"',
  dividirEnunciado('Caso clínico com achados laboratoriais.\n\nApenas está correta o que se afirma em:').criterio,
  'paragrafo',
);

// O `\b` que fecha RE_ABERTURA caía entre o "d" de `diante\s+d` e o "o" de "do",
// e nenhuma preposição contraída casava — 3 questões da 2025.1 sem divisão.
igual(
  'abertura com preposição contraída casa',
  dividirEnunciado(
    'Ao exame, o recém-nascido apresenta ganho de peso adequado, sem sinais de desidratação. ' +
    'Diante do quadro, qual deve ser a conduta médica mais adequada neste momento?',
  ).criterio,
  'frase',
);

// Última frase interrogativa: não depende de lista de aberturas nenhuma.
const interrogativa = dividirEnunciado(
  'O médico examina a paciente e encontra o colo completamente dilatado, com contrações a cada 2 minutos. ' +
  'O médico conclui que a paciente entrou em qual fase do parto?',
);
igual('corte por última frase interrogativa', interrogativa.criterio, 'frase_interrogativa');
ok('pergunta é a frase com "?"', interrogativa.pergunta.endsWith('?'));

// Fechamento em ":" com substantivo de prova, sem verbo de comando.
igual(
  'fechamento "a melhor conduta a ser tomada é:"',
  dividirEnunciado(
    'Lactente com baixo ganho ponderal.\n\nApós colocar os dados antropométricos nos gráficos, a melhor conduta a ser tomada é:',
  ).criterio,
  'paragrafo',
);
igual(
  'fechamento curto "Estão corretas:"',
  dividirEnunciado('Sobre as manobras semiológicas, analise as assertivas.\n\nEstão corretas:').criterio,
  'paragrafo',
);

// Pergunta no meio (assertivas depois) exigiria reordenar: não divide.
igual(
  'não divide quando a pergunta não é o fim',
  dividirEnunciado(
    'Paciente com disúria.\n\nCom base no EAS, assinale a alternativa correta.\n\n' +
    'Assertivas:\n\nI. Nitrito positivo indica enterobactérias e é achado esperado no caso descrito.',
  ).criterio,
  'campo_unico',
);

// Nada pode ser descartado por nenhum dos cortes.
for (const bruto of [
  'Caso clínico.\n\nCom base no exposto, assinale a correta.',
  'Narrativa longa que termina numa frase. Considerando o exposto, qual a conduta?',
  'Parágrafo único sem pergunta nenhuma reconhecível aqui.',
]) {
  const d = dividirEnunciado(bruto);
  const junto = (d.apoio + ' ' + d.pergunta).replace(/\s+/g, ' ').trim();
  const orig = bruto.replace(/\s+/g, ' ').trim();
  ok(`divisão não perde texto (${d.criterio})`, junto === orig, `"${junto}" ≠ "${orig}"`);
}

// ─────────────────── questões de assertivas ───────────────────

const qAssertivas = {
  numero: 4,
  alternativas: { a: 'I e III.', b: 'I, II e III.', c: 'I e II.', d: 'III e IV.' },
  letra_correta: 'b',
  corretas_marcadas: ['b'],
  enunciado: 'É correto o que se afirma em:',
  explicacao:
    'Assertiva I: Correta. O Sinal de Murphy indica colecistite aguda.\n\n' +
    'Assertiva II: Correta. O Sinal de Blumberg indica irritação peritoneal.\n\n' +
    'Assertiva III: Correta. O Sinal de Rovsing sugere apendicite aguda.\n\n' +
    'Assertiva IV: Incorreta. Diverticulite não é o diagnóstico provável.',
  trechos_suspeitos: [],
};

ok('reconhece questão de assertivas', ehQuestaoDeAssertivas(qAssertivas));
ok(
  'não confunde questão normal com assertivas',
  !ehQuestaoDeAssertivas({
    alternativas: { a: 'Deposição mesangial de IgA após infecção.', b: 'Ativação da via clássica do complemento.' },
  }),
);

const cruz = cruzamentoDeAssertivas(qAssertivas);
igual('assertivas corretas extraídas', cruz.corretos.join(','), 'I,II,III');
igual('letra esperada casa o conjunto', cruz.letra_esperada, 'b');

const resultado = crivoCruzamento(qAssertivas);
igual('cobertura forte por conjunto de assertivas', resultado.cobertura, 'forte');
igual('sem flag quando concorda', resultado.flags.length, 0);

// Gabarito trocado: é o erro que este crivo existe para pegar.
const trocada = { ...qAssertivas, letra_correta: 'd', corretas_marcadas: ['d'] };
const rTrocada = crivoCruzamento(trocada);
igual('contradição de assertivas é flag alta', rTrocada.flags[0]?.severidade, 'alta');
igual('com o código certo', rTrocada.flags[0]?.codigo, 'gabarito_contradiz_assertivas');

// "I, apenas." não é alternativa truncada.
igual(
  'alternativa de assertiva não vira alternativa_degenerada',
  crivoEstrutura({ ...qAssertivas, alternativas: { a: 'I, apenas.', b: 'II, apenas.', c: 'III, apenas.', d: 'IV, apenas.' }, letra_correta: 'a', corretas_marcadas: ['a'] })
    .filter((f) => f.codigo === 'alternativa_degenerada').length,
  0,
);

// ─────────────────── cruzamento por eliminação ───────────────────
// Caso da questão 7: a justificativa da correta parafraseia, mas as três outras
// são explicitamente chamadas de incorretas.

const porEliminacao = crivoCruzamento({
  numero: 7,
  letra_correta: 'c',
  corretas_marcadas: ['c'],
  enunciado: 'Assinale a alternativa correta.',
  alternativas: {
    a: 'Deposição mesangial de IgA após infecção de vias aéreas superiores.',
    b: 'Ativação da via clássica do complemento por anticorpos anti-membrana basal.',
    c: 'Deposição de imunocomplexos pós-infecção estreptocócica ativando a via alternativa.',
    d: 'Deposição de imunocomplexos na membrana basal glomerular com biópsia imediata.',
  },
  explicacao:
    'Correta. O caso é típico de Glomerulonefrite Pós-Estreptocócica com C3 baixo.\n\n' +
    'Deposição mesangial de IgA após infecção de vias aéreas superiores.\n\n' +
    'Incorreta. A nefropatia por IgA causa hematúria simultânea à infecção.\n\n' +
    'Ativação da via clássica do complemento por anticorpos anti-membrana basal.\n\n' +
    'Incorreta. Não há anticorpos anti-membrana basal neste caso.\n\n' +
    'Deposição de imunocomplexos na membrana basal glomerular com biópsia imediata.\n\n' +
    'Incorreta. A biópsia não é indicada de rotina.',
  trechos_suspeitos: [],
});
igual('eliminação confirma o gabarito', porEliminacao.cobertura, 'forte_por_eliminacao');
igual('e não levanta flag', porEliminacao.flags.filter((f) => f.severidade === 'alta').length, 0);

// ────────── crivo 2: acusação de contradição não pode ser barata ──────────
// Os quatro casos abaixo são falsos positivos que a Integradora 2025.1 produziu.
// Acusar o gabarito de errado quando ele está certo custa confiança no relatório
// inteiro, então cada um virou teste.

const ALTS_HEPATITE = {
  a: 'Hepatite viral tipo B aguda.',
  b: 'Hepatite viral tipo A aguda.',
  c: 'Hepatite viral tipo C crônica.',
  d: 'Hepatite viral tipo E aguda.',
};

// 1. Discriminador de um caractere só: "tipo A" e "tipo B" têm bigramas
//    idênticos (a letra é curta demais para virar token), então os parágrafos
//    empatam e o primeiro venceria por acidente.
const empate = crivoCruzamento({
  numero: 26,
  letra_correta: 'b',
  corretas_marcadas: ['b'],
  enunciado: 'Assinale a hipótese diagnóstica.',
  alternativas: ALTS_HEPATITE,
  explicacao:
    'Alternativa INCORRETA: Hepatite viral tipo B aguda. Justificativa: o marcador típico seria HBsAg positivo.\n\n' +
    'Alternativa CORRETA Hepatite viral tipo A aguda. Justificativa: anti-HAV IgM positivo indica infecção aguda.',
  trechos_suspeitos: [],
});
igual('empate de parágrafos não acusa contradição', empate.flags.filter((f) => f.severidade === 'alta').length, 0);
ok('e o empate fica registrado', Object.values(empate.vereditos).some((v) => v.empate));

// 2. Veredito dentro do texto da própria alternativa (questão de V/F).
const vfProprio = crivoCruzamento({
  numero: 17,
  letra_correta: 'a',
  corretas_marcadas: ['a'],
  enunciado: 'Julgue as assertivas.',
  alternativas: {
    a: 'A assertiva I é verdadeira e a II é falsa.',
    b: 'A assertiva I é falsa e a II é verdadeira.',
    c: 'Ambas as assertivas são verdadeiras.',
    d: 'Ambas as assertivas são falsas.',
  },
  explicacao:
    'A assertiva I é verdadeira e a II é falsa.\n\n' +
    'Ciprofloxacina e levofloxacina são fluoroquinolonas com boa penetração no trato urinário superior.\n\n' +
    'A nitrofurantoína não é fluoroquinolona e não atinge concentração terapêutica nos rins.',
  trechos_suspeitos: [],
});
igual(
  '"falsa" no texto da alternativa não é veredito contra ela',
  vfProprio.flags.filter((f) => f.codigo === 'marcada_como_incorreta').length,
  0,
);

// 3. Oração concessiva: "Erro:" é o veredito, "estejam corretos" é prosa.
const concessiva = crivoCruzamento({
  numero: 28,
  letra_correta: 'a',
  corretas_marcadas: ['a'],
  enunciado: 'Assinale agente, fármaco e mecanismo.',
  alternativas: {
    a: 'Agente: Giardia lamblia. Fármaco: Metronidazol. Mecanismo: ativação intracelular por nitrorredução.',
    b: 'Agente: Cryptosporidium parvum. Fármaco: Sulfametoxazol-Trimetoprim. Mecanismo: bloqueio sequencial do folato.',
    c: 'Agente: Entamoeba histolytica. Fármaco: Tinidazol. Mecanismo: inibição da betatubulina parasitária.',
    d: 'Agente: Giardia lamblia. Fármaco: Albendazol. Mecanismo: inibição da piruvato-ferredoxina oxidorredutase.',
  },
  explicacao:
    'Agente: Giardia lamblia. Fármaco: Metronidazol. Mecanismo: ativação intracelular por nitrorredução.\n\n' +
    'Comentário: Correta. O metronidazol é o nitroimidazólico de primeira linha para giardíase.\n\n' +
    'Erro: Embora Giardia lamblia e o quadro clínico estejam corretos, o Albendazol atua na betatubulina, ' +
    'e não na piruvato-ferredoxina oxidorredutase.',
  trechos_suspeitos: [],
});
igual(
  '"estejam corretos" em oração concessiva não vira veredito de correta',
  concessiva.flags.filter((f) => f.codigo === 'gabarito_contradiz_comentario').length,
  0,
);

// 4. Comentário em seções: o cabeçalho vale para os parágrafos seguintes.
const porSecao = crivoCruzamento({
  numero: 12,
  letra_correta: 'a',
  corretas_marcadas: ['a'],
  enunciado: 'Assinale a conduta correta.',
  alternativas: {
    a: 'Orientar aleitamento materno exclusivo até 6 meses em livre demanda e corrigir pega e posição.',
    b: 'Orientar aleitamento apenas até 4 meses com água e sucos nos dias quentes e indicar chupeta.',
    c: 'Orientar oferta de fórmula devido ao choro e suspender as mamadas noturnas do lactente.',
    d: 'Orientar desmame precoce e introdução de alimentos sólidos antes dos 4 meses de vida.',
  },
  explicacao:
    'Resposta correta:\n\n' +
    'Orientar aleitamento materno exclusivo até 6 meses em livre demanda e corrigir pega e posição.\n\n' +
    'Por que as demais estão incorretas:\n\n' +
    'Orientar aleitamento apenas até 4 meses com água e sucos nos dias quentes e indicar chupeta.\n\n' +
    'Orientar oferta de fórmula devido ao choro e suspender as mamadas noturnas do lactente.\n\n' +
    'Orientar desmame precoce e introdução de alimentos sólidos antes dos 4 meses de vida.',
  trechos_suspeitos: [],
});
igual('seção do comentário confirma o gabarito', porSecao.cobertura, 'forte');
igual('sem flag quando a seção concorda', porSecao.flags.filter((f) => f.severidade === 'alta').length, 0);

// 5. Julgamentos empacotados num parágrafo só, sem linha em branco entre eles.
// A IESC 2025.2 escreve os quatro seguidos; o comentário inteiro virava UM
// parágrafo, o veredito lido era o do começo do bloco (que julga outra
// alternativa) e a questão 1 saía acusada de gabarito errado.
const ALTS_PNAISC = {
  a: 'Realizar a anamnese detalhada, preencher a caderneta de saúde, atualizar a vacinação e articular com a rede de proteção social.',
  b: 'Orientar a mãe a levar a criança imediatamente a um serviço de urgência especializado para avaliação completa.',
  c: 'Solicitar exames complementares, agendar retorno para reavaliação clínica em 30 dias e orientar sobre sinais de alerta.',
  d: 'Prescrever fórmula infantil para complementar a nutrição e solicitar consulta com pediatra em caráter eletivo.',
};

const empacotado = crivoCruzamento({
  numero: 1,
  formato: 'fechada',
  letra_correta: 'a',
  corretas_marcadas: ['a'],
  enunciado: 'Marque a conduta inicial mais adequada.',
  alternativas: ALTS_PNAISC,
  explicacao:
    'Incorreto: Ao prescrever fórmula infantil para complementar a nutrição e solicitar consulta com ' +
    'pediatra em caráter eletivo, a equipe ignora a promoção do aleitamento materno. ' +
    'Correto: Realizar a anamnese detalhada, preencher a caderneta de saúde, atualizar a vacinação e ' +
    'articular com a rede de proteção social. A equipe demonstra a capacidade resolutiva da APS. ' +
    'Incorreta: Ao solicitar exames complementares e agendar retorno para reavaliação clínica em 30 ' +
    'dias, a equipe posterga a assistência. ' +
    'Incorreta: Ao orientar a mãe a levar a criança imediatamente a um serviço de urgência ' +
    'especializado, a equipe reduz um problema complexo a uma queixa biomédica isolada.',
  trechos_suspeitos: [],
});
igual(
  'julgamentos empacotados não acusam contradição',
  empacotado.flags.filter((f) => f.severidade === 'alta').length,
  0,
);
igual('e o gabarito fica confirmado', empacotado.cobertura, 'forte');

// O formato espelhado — citação primeiro, veredito depois — parece o mesmo e se
// comporta ao contrário: cortar antes de cada veredito junta a justificativa de
// uma alternativa com a citação da seguinte, deslocando tudo em um. Foi assim
// que a questão 4 da IESC 2025.1 passou a ser acusada. Aqui o crivo tem que
// ficar sem confirmação — que é diferente de acusar.
const vereditoNoFim = crivoCruzamento({
  numero: 4,
  formato: 'fechada',
  letra_correta: 'b',
  corretas_marcadas: ['b'],
  enunciado: 'Marque a opção verdadeira.',
  alternativas: {
    a: 'Na avaliação da pele, o médico deve atentar estritamente à presença de edema, palidez e cianose.',
    b: 'O teste do olhinho deve ser orientado, pois pode indicar catarata congênita ou retinopatia da prematuridade.',
    c: 'No exame do crânio, é esperado que a fontanela posterior já esteja fechada.',
    d: 'Em caso de prematuridade, o teste da orelhinha é contraindicado, pois o sistema auditivo não amadureceu.',
  },
  explicacao:
    'No exame do crânio, é esperado que a fontanela posterior já esteja fechada. Incorreta: A fontanela ' +
    'posterior é triangular e fecha-se até o segundo mês. ' +
    'Na avaliação da pele, o médico deve atentar estritamente à presença de edema, palidez e cianose. ' +
    'Incorreta: O profissional deverá estar atento caso a icterícia tenha se iniciado nas primeiras 24 horas. ' +
    'Em caso de prematuridade, o teste da orelhinha é contraindicado, pois o sistema auditivo não amadureceu. ' +
    'Incorreta: Oriente a família para a realização da triagem auditiva neonatal universal.',
  trechos_suspeitos: [],
});
igual(
  'veredito depois da citação não vira acusação',
  vereditoNoFim.flags.filter((f) => f.codigo === 'marcada_como_incorreta').length,
  0,
);

// Alternativa de assertiva com boilerplate ainda é questão de assertivas.
ok(
  'assertiva verbosa é reconhecida',
  ehQuestaoDeAssertivas({
    alternativas: {
      a: 'Apenas as afirmativas I e II estão corretas.',
      b: 'Apenas as afirmativas I, II e IV estão corretas.',
      c: 'Apenas as afirmativas III e IV estão corretas.',
      d: 'Todas as afirmativas estão corretas.',
    },
  }),
);

// ─────────────────── imagem: menção com dêixis ───────────────────
// "quadro" fora do detector de propósito: em prova médica é o caso do paciente.

ok('figura com dêixis é detectada', mencoesDeFigura('Observe a imagem abaixo e responda.').length === 1);
ok('radiografia a seguir é detectada', mencoesDeFigura('Analise a radiografia de tórax a seguir.').length === 1);
igual(
  'quadro clínico não é figura',
  mencoesDeFigura('Com base nesse quadro clínico, assinale a alternativa correta.').length,
  0,
);
igual(
  'achado narrado por escrito não é figura',
  mencoesDeFigura('A ultrassonografia revelou imagem hiperecogênica de 8 mm em cálice renal.').length,
  0,
);
igual(
  'tabela de dados é detectada',
  mencoesDeTabela('Considere os dados da tabela abaixo.').length,
  1,
);
igual(
  'quadro numerado conta como tabela',
  mencoesDeTabela('Os valores de referência estão no quadro 2 do anexo.').length,
  1,
);
igual(
  'quadro febril não conta como tabela',
  mencoesDeTabela('A criança apresenta quadro febril há três dias.').length,
  0,
);
// A dêixis desambigua figura, mas não `quadro`: "Diante do quadro acima" é o caso
// do paciente, e era o único "achado" de tabela da Integradora 2024.2.
igual(
  'quadro com dêixis não conta como tabela',
  mencoesDeTabela('Diante do quadro acima, analise as assertivas.').length,
  0,
);

// ─────────────────── tabela: colunas alinhadas ───────────────────

const TABELA = [
  'Parâmetro          Valor           Referência',
  'Hemoglobina        8,2 g/dL        12 a 16 g/dL',
  'Leucócitos         18.000/mm³      4.000 a 11.000/mm³',
];
igual('bloco tabular é reconhecido', linhasTabulares(TABELA).length, 1);
igual('e traz as três linhas', linhasTabulares(TABELA)[0].length, 3);

// Justificação de texto em referência bibliográfica produz espaço largo isolado.
igual(
  'linha isolada com espaço largo não é tabela',
  linhasTabulares(['2024.            E-book.           ISBN           9788520458679.']).length,
  0,
);

const sub = substituirTabelas(['Exames:', ...TABELA, 'Assinale a correta.'].join('\n'));
igual('um bloco substituído', sub.substituidos, 1);
ok('placeholder entra no lugar', sub.texto.includes('[TABELA DA PROVA'));
ok('conteúdo tabular sai do texto', !sub.texto.includes('Hemoglobina'));
ok('resto do texto preservado', sub.texto.includes('Exames:') && sub.texto.includes('Assinale a correta.'));
ok('placeholder não é lido como rótulo pelo parser do admin', !RESERVADO.test('[TABELA DA PROVA — não convertida em texto; inserir manualmente]'));

// ─────────────────── estrutura ───────────────────

igual(
  'duas alternativas marcadas (CORRETA) é flag alta',
  crivoEstrutura({
    alternativas: { a: 'Texto suficientemente longo A.', b: 'Texto suficientemente longo B.', c: 'Texto longo C aqui.', d: 'Texto longo D aqui.' },
    letra_correta: null,
    corretas_marcadas: ['a', 'c'],
    enunciado: 'Assinale.',
  }).filter((f) => f.codigo === 'sem_correta_unica' && f.severidade === 'alta').length,
  1,
);
igual(
  'alternativas não contíguas é flag alta',
  crivoEstrutura({
    alternativas: { b: 'Texto suficientemente longo B.', c: 'Texto suficientemente longo C.', d: 'Texto longo D aqui.', e: 'Texto longo E aqui.' },
    letra_correta: 'b',
    corretas_marcadas: ['b'],
    enunciado: 'Assinale.',
  }).filter((f) => f.codigo === 'alternativas_nao_contiguas').length,
  1,
);
igual(
  'alternativas idênticas é flag alta',
  crivoEstrutura({
    alternativas: { a: 'Mesmo texto repetido aqui.', b: 'Mesmo texto repetido aqui.', c: 'Outro texto qualquer aqui.', d: 'Mais um texto distinto.' },
    letra_correta: 'a',
    corretas_marcadas: ['a'],
    enunciado: 'Assinale.',
  }).filter((f) => f.codigo === 'alternativas_duplicadas').length,
  1,
);

// ─────────────────── prova genérica: cabeçalho ───────────────────
// Procurar `INTEGRADORA` não achava nada em SOI nem em HAM, e filtrar por caixa
// alta reprovava `Nl ESPECIFICA SOi 4 04MAIO2023`. O título é posicional: o que
// está solto logo acima de "RELATÓRIO DE DEVOLUTIVA DE PROVA".

const CAPA_SOI = [
  '                                  AFYA          NOTA FINAL',
  '                          CURSO DE MEDICINA - AFYA',
  '   Aluno:',
  '   Componente Curricular: Sistemas Orgânicos Integrados IV',
  '   Professor (es):',
  '   Período: 202502                Turma:      Data: 29/09/2025',
  'N1 ESPECÍFICA - MEDICINA - SOI IV - 2025.2 - 1ª CHAMADA -',
  '                         29/SETEMBRO',
  '   RELATÓRIO DE DEVOLUTIVA DE PROVA',
  '           PROVA 17282 - CADERNO 001',
].join('\n');

const capa = cabecalhoDaProva([CAPA_SOI]);
igual(
  'título de prova não-Integradora é reconhecido',
  capa.titulo,
  'N1 ESPECÍFICA - MEDICINA - SOI IV - 2025.2 - 1ª CHAMADA - 29/SETEMBRO',
);
igual('componente continua saindo do rótulo', capa.componente, 'Sistemas Orgânicos Integrados IV');
igual('prova e caderno preservados', `${capa.prova}/${capa.caderno}`, '17282/001');

// ─────────────────── marcador de questão fora da linha própria ───────────────────
// Em SOI e HAM o `-layout` põe o marcador na mesma linha de outro elemento. Com
// a regex ancorada em `^…$`, 11 das 13 questões da SOI 2022.2 sumiam em silêncio.

const marcadorCompartilhado = fatiarQuestoes([[
  ' Enunciado:                                    1ª QUESTÃO',
  ' (FASA Vic) Paciente de 32 anos com icterícia e colúria há uma semana.',
  ' Alternativas:',
  ' (alternativa A) (CORRETA)',
  ' Hepatite viral aguda, confirmada pelo perfil sorológico apresentado no caso.',
  ' (alternativa B)',
  ' Colangite esclerosante primária, sem relação com o quadro sorológico descrito.',
  ' Feedback:                                     2ª QUESTÃO',
  ' --',
  ' Enunciado:',
  ' (IESVAP) Homem de 45 anos, etilista, com dor abdominal em faixa.',
  ' Alternativas:',
  ' (alternativa A) (CORRETA)',
  ' Pancreatite aguda, sugerida pela elevação de amilase e lipase séricas.',
  ' (alternativa B)',
  ' Úlcera péptica perfurada, que cursaria com pneumoperitônio na radiografia.',
].join('\n')]);
igual('marcador colado a rótulo é detectado', marcadorCompartilhado.blocos.length, 2);
igual('sem lacuna na numeração', marcadorCompartilhado.erros.length, 0);

const [q1Colada, q2Colada] = marcadorCompartilhado.blocos.map((b) => parsearQuestao(b));
// `Enunciado:` antes do marcador abre a questão nova; `Feedback:` fecha a anterior.
ok('rótulo de abertura vai para a questão que começa', q1Colada.enunciado.includes('icterícia'));
ok('rótulo de fechamento fica com a anterior', q1Colada.feedback === null || !q2Colada.enunciado.includes('Feedback'));
ok('a segunda questão fica íntegra', q2Colada.enunciado.includes('dor abdominal em faixa'));
igual('e com o gabarito certo', q2Colada.letra_correta, 'a');

// Ordinal corrompido pelo digitalizador (`12!! QUESTÃO` na SOI 2023.1) reprovava
// a prova inteira por lacuna na numeração.
igual(
  'ordinal corrompido não vira lacuna',
  fatiarQuestoes(['   1ª QUESTÃO\n Enunciado:\n Caso um.\n   2!! QUESTÃO\n Enunciado:\n Caso dois.'])
    .erros.length,
  0,
);

// ─────────────────── layout de duas colunas ───────────────────

ok(
  'relatório de 2022.2 é reconhecido como duas colunas',
  ehLayoutDeDuasColunas([
    Array.from({ length: 50 }, (_, i) =>
      `                     Linha ${i} de conteúdo indentado na coluna da direita.`).join('\n'),
  ]),
);
ok(
  'relatório linear não é confundido',
  !ehLayoutDeDuasColunas([
    Array.from({ length: 50 }, (_, i) => `Linha ${i} de conteúdo na margem esquerda da página.`).join('\n'),
  ]),
);

// ─────────────────── origem em caixa mista ───────────────────
// SOI e HAM não trazem o filtro `[IES]` que confirmava a origem na Integradora,
// e escrevem `(AFYA Bragança)` em vez de `(FACIMPA)`. Sem esta regra a sigla
// ficava no meio do enunciado.

for (const [origem, texto] of [
  ['AFYA Bragança', 'Uma paciente de 45 anos apresenta dor epigástrica recorrente.'],
  ['FASA Vic', 'Um paciente de 32 anos procura a unidade de saúde com icterícia.'],
  ['AFYA Cruzeiro do Sul', 'Homem, 54 anos, com histórico de etilismo crônico.'],
  ['IESVAP', 'Um homem de 45 anos é admitido no pronto-socorro com dor abdominal.'],
]) {
  const q = parsearQuestao(fatiarQuestoes([[
    '  1ª QUESTÃO',
    ' Enunciado:',
    ` (${origem}) ${texto}`,
    '',
    ' Assinale a alternativa correta.',
    ' Alternativas:',
    ' (alternativa A) (CORRETA)',
    ' Primeira alternativa com texto suficientemente longo para o crivo.',
    ' (alternativa B)',
    ' Segunda alternativa com texto suficientemente longo para o crivo.',
  ].join('\n')]).blocos[0]);
  igual(`origem "${origem}" sai do enunciado`, q.fonte_original, origem);
  ok(`e o enunciado começa no caso (${origem})`, q.enunciado_apoio.startsWith(texto.slice(0, 20)));
}

// Parêntese de conteúdo em caixa mista continua não sendo origem.
igual(
  'parêntese de conteúdo não vira origem',
  parsearQuestao(fatiarQuestoes([[
    '  1ª QUESTÃO',
    ' Enunciado:',
    ' (Considere a hipótese descrita a seguir) O paciente evolui com febre alta.',
    ' Alternativas:',
    ' (alternativa A) (CORRETA)',
    ' Primeira alternativa com texto suficientemente longo para o crivo.',
    ' (alternativa B)',
    ' Segunda alternativa com texto suficientemente longo para o crivo.',
  ].join('\n')]).blocos[0]).fonte_original,
  null,
);

// ─────────────────── questão discursiva ───────────────────
// As provas de SOI e HAM trazem duas por prova. O relatório não declara o
// formato: a discursiva é a que emite `Alternativas:` seguido de `--`.

const DISCURSIVA = [
  '  1ª QUESTÃO',
  ' Enunciado:',
  ' (AFYA SANTA INÊS) Um paciente, de 32 anos, sem comorbidades, apresenta febre, disúria,',
  ' polaciúria e dor lombar unilateral há 48 horas. O exame de urina tipo 1 revela piúria.',
  '',
  ' Considerando o quadro clínico e laboratorial, responda às perguntas a seguir.',
  '',
  ' a) Caracterize o quadro clínico do paciente e cite o provável agente etiológico.',
  '',
  ' b) Explique os mecanismos fisiopatológicos subjacentes à infecção do trato urinário.',
  '',
  ' Alternativas:',
  ' --',
  ' Resposta comentada:',
  ' a) O paciente apresenta pielonefrite aguda, infecção do trato urinário superior, e o agente',
  ' etiológico mais provável é a Escherichia coli, responsável pela maioria dos casos descritos.',
  ' b) A invasão bacteriana ascendente causa inflamação local, edema e obstrução parcial do fluxo.',
  ' Referências:',
  ' LOSCALZO, José. Medicina Interna de Harrison. Grupo A, 2024.',
].join('\n');

const discursiva = parsearQuestao(fatiarQuestoes([DISCURSIVA]).blocos[0]);
igual('questão sem alternativas é discursiva', discursiva.formato, 'aberta');
igual('sem gabarito de letra', discursiva.letra_correta, null);
ok('resposta comentada vira resposta modelo', discursiva.resposta_modelo.includes('pielonefrite'));
igual('e não é duplicada em explicação', discursiva.explicacao, '');
ok('origem também é extraída na discursiva', discursiva.fonte_original === 'AFYA SANTA INÊS');

// O corte por itens: sem ele só o item `b)` iria para ENUNCIADO e o `a)` cairia
// no texto de apoio — a questão entraria perguntando metade.
igual('enunciado com subitens corta nos itens', discursiva.divisao, 'itens');
ok('pergunta contém os dois itens', /a\)/.test(discursiva.enunciado) && /b\)/.test(discursiva.enunciado));
ok('apoio guarda só o caso clínico', discursiva.enunciado_apoio.includes('disúria') && !discursiva.enunciado_apoio.includes('a) Caracterize'));

igual(
  'corte por itens preserva o texto inteiro',
  `${discursiva.enunciado_apoio} ${discursiva.enunciado}`.replace(/\s+/g, ' ').trim(),
  discursiva.enunciado_bruto.replace(/^\s*\(AFYA SANTA INÊS\)\s*/, '').replace(/\s+/g, ' ').trim(),
);

// Item isolado dentro do caso clínico não é comando.
igual(
  'um item só não dispara o corte por itens',
  dividirEnunciado('Exames do paciente.\n\na) Hemograma completo sem alterações.\n\nAssinale a alternativa correta.').criterio,
  'paragrafo',
);

// Distinguir discursiva de questão mutilada é o ponto do `indefinido`: campo
// vazio é formato; campo com texto que não virou alternativa é bug do parser.
igual('campo Alternativas vazio é discursiva', classificarFormato({}, '--'), 'aberta');
igual('campo Alternativas em branco é discursiva', classificarFormato({}, '   '), 'aberta');
igual(
  'campo Alternativas com texto e sem marcador é indefinido',
  classificarFormato({}, 'Hepatite viral aguda. Colangite esclerosante.'),
  'indefinido',
);
igual('com alternativa parseada é fechada', classificarFormato({ a: 'texto' }, ''), 'fechada');

// Formato indefinido bloqueia antes de qualquer outra conclusão.
igual(
  'formato indefinido é flag alta',
  crivoEstrutura({
    formato: 'indefinido',
    alternativas: {},
    enunciado: 'Assinale a alternativa correta.',
    letra_correta: null,
    corretas_marcadas: [],
  }).filter((f) => f.codigo === 'formato_indefinido' && f.severidade === 'alta').length,
  1,
);

// Discursiva não é cobrada por alternativa nem por gabarito.
const flagsDiscursiva = crivoEstrutura({
  formato: 'aberta',
  alternativas: {},
  enunciado: discursiva.enunciado,
  resposta_modelo: discursiva.resposta_modelo,
  letra_correta: null,
  corretas_marcadas: [],
});
igual('discursiva íntegra não levanta flag alta', flagsDiscursiva.filter((f) => f.severidade === 'alta').length, 0);

igual(
  'discursiva sem resposta modelo é bloqueio',
  crivoDiscursiva({ formato: 'aberta', alternativas: {}, enunciado: 'Explique.', resposta_modelo: '' })
    .filter((f) => f.codigo === 'sem_resposta_modelo' && f.severidade === 'alta').length,
  1,
);

igual(
  'item do enunciado sem eco na chave é sinalizado',
  crivoDiscursiva({
    formato: 'aberta',
    alternativas: {},
    enunciado: 'Responda:\n\na) Cite o agente etiológico.\n\nb) Descreva o tratamento indicado.',
    resposta_modelo: 'a) O agente é a Escherichia coli, responsável pela maioria dos casos de pielonefrite aguda descritos.',
  }).filter((f) => f.codigo === 'item_sem_resposta').length,
  1,
);

// O crivo do cruzamento não se aplica: não há alternativa marcada para conferir.
igual(
  'cruzamento não se aplica à discursiva',
  crivoCruzamento({ formato: 'aberta', alternativas: {}, explicacao: '', letra_correta: null }).cobertura,
  'nao_se_aplica',
);

// ─────────────────── resultado ───────────────────

console.log('');
if (falhas.length === 0) {
  console.log(`✓ ${passou} verificações passaram`);
  process.exit(0);
}
console.log(`${passou} passaram, ${falhas.length} falharam:\n`);
for (const f of falhas) console.log(`  ✗ ${f}`);
process.exit(1);
