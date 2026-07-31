#!/usr/bin/env node
/**
 * FASE 2 — Validação mecânica (zero IA).
 *
 * É daqui que sai a confiabilidade. Nada é aceito por "a IA transcreveu";
 * cada questão passa por quatro crivos independentes:
 *
 *   1. ESTRUTURA   — 5 alternativas a–e, enunciado presente, sem duplicatas.
 *   2. CONSENSO    — as testemunhas independentes do scan têm que coincidir:
 *                    um segundo passe de transcrição, quando existe, e o OCR da
 *                    página (ocr.mjs), que custa zero e erra de forma
 *                    descorrelacionada de um LLM.
 *   3. CRUZAMENTO  — a alternativa apontada pelo gabarito tem que aparecer no
 *                    comentário da devolutiva, e os distratores na seção de
 *                    distratores. Texto corrompido por OCR não casa com nada
 *                    e cai aqui.
 *   4. INTEGRIDADE — heurísticas de truncamento e corrupção de caracteres.
 *
 * O gabarito NUNCA vem da transcrição do scan: as marcações à mão do aluno são
 * irrelevantes e o contrato de transcrição proíbe o campo. Ele vem do PDF
 * oficial, e entre as duas fontes oficiais vale a mais forte — a devolutiva
 * comentada acima da folha de gabarito seca (ver lib/gabarito.mjs).
 *
 * Uso: node scripts/importar-prova-scan/validar.mjs <dir-trabalho> [--extras-ok]
 *
 * `--extras-ok` rebaixa para aviso (em vez de erro global bloqueante) o caso
 * de haver páginas transcritas cuja questão não existe no gabarito. Nesse
 * pipeline normalmente é sinal de bug (número incorreto, questão perdida na
 * costura). Mas quando o gabarito veio de `derivar-gabarito.mjs` — cobertura
 * parcial por design, porque nem toda questão do scan tem correspondente na
 * devolutiva disponível — esse caso é esperado, e usar a flag evita que a
 * ausência intencional de gabarito nas demais questões bloqueie a validação
 * das poucas que têm.
 */

import { writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/pdf.mjs';
import { carregarPasse, costurar, LETRAS } from './lib/transcricao.mjs';
import { resolverGabarito } from './lib/gabarito.mjs';
import { preencherLacunas, validarResolucao, contarLacunas } from './lib/lacunas.mjs';
import {
  similaridade,
  similaridadeVocabulario,
  tokens,
  compararCampo,
  diffPalavras,
  colapsar,
} from './lib/texto.mjs';

// ──── Limiares, calibrados contra a devolutiva desta prova ────
// Na Q1: alternativa correta = 1.00 no comentário, distratores = 0.00.
// OCR corrompido ("Laparotomla explaradora") = 0.00. A margem é larga.
const CONFIRMA = 0.6;   // acima disso, considerado confirmado pela devolutiva
const DUVIDA = 0.34;    // abaixo disso, não confirmado
const MIN_TOKENS = 2;   // com menos tokens que isso o cruzamento não discrimina

// Limiar do eco no OCR, calibrado nas páginas 1, 3, 12, 25 e 40 desta prova
// (65 campos): texto genuíno ficou entre 0.64 e 1.00, mediana 1.00; texto
// corrompido, alucinação plausível e frase inventada ficaram entre 0.00 e 0.29.
// 0.45 fica no meio do vão — mais sensível que o DUVIDA genérico e ainda sem
// falso alarme na amostra.
const OCR_ECO = 0.45;

const SEV = { alta: 3, media: 2, baixa: 1 };

const dirArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const extrasOk = process.argv.includes('--extras-ok');
if (!dirArg) {
  console.error('uso: node validar.mjs <dir-trabalho> [--extras-ok]');
  process.exit(2);
}
const dir = resolve(dirArg);

const manifesto = lerJson(join(dir, 'manifesto.json'));
const gabarito = lerJson(join(dir, 'gabarito.json'));
const devolutiva = lerJson(join(dir, 'devolutiva.json'));
const indicePaginas = lerJson(join(dir, 'paginas', 'index.json'));

if (!manifesto || !gabarito || !devolutiva || !indicePaginas) {
  console.error(`extração incompleta em ${dir} — rode extrair.mjs primeiro`);
  process.exit(2);
}

const paginasEsperadas = indicePaginas.map((p) => p.pagina_pdf);
const errosGlobais = [];

// ──── Carga dos dois passes ────

// Modo de um passe só: usado para triagem antes de decidir onde vale pagar o
// segundo passe. Sem consenso nenhuma questão fica totalmente verificada, e o
// relatório diz quais páginas precisam do passe 2 — as questões em que o
// cruzamento com a devolutiva também não conclui.
const contarJson = (d) =>
  existsSync(d) ? readdirSync(d).filter((f) => /^p\d{3}\.json$/.test(f)).length : 0;
const UM_PASSE =
  process.argv.includes('--um-passe') ||
  contarJson(join(dir, 'transcricao', 'passe2')) === 0;

const passes = { passe1: new Map(), passe2: new Map() };
for (const nome of UM_PASSE ? ['passe1'] : ['passe1', 'passe2']) {
  // O passe 2 é opcional e costuma ser parcial por design (só as páginas em
  // que vale pagar uma segunda transcrição, ver comentário acima) — cobrar
  // 100% de cobertura dele, como se fizesse do passe 1, reportaria "página
  // não transcrita" para todo o resto da prova sem necessidade.
  const esperadasDoPasse = nome === 'passe2'
    ? readdirSync(join(dir, 'transcricao', 'passe2'))
        .filter((f) => /^p\d{3}\.json$/.test(f))
        .map((f) => parseInt(f.slice(1, 4), 10))
        .sort((a, b) => a - b)
    : paginasEsperadas;
  const { paginas, erros } = carregarPasse(join(dir, 'transcricao', nome), esperadasDoPasse);
  erros.forEach((e) => errosGlobais.push(`${nome}: ${e}`));
  const { questoes, erros: errosCostura, avisos } = costurar(paginas);
  // No passe 2 parcial, "lacuna na numeração" é o esperado — são só as
  // páginas escolhidas para segunda transcrição, não a prova inteira.
  errosCostura
    .filter((e) => nome !== 'passe2' || !e.startsWith('lacuna na numeração'))
    .forEach((e) => errosGlobais.push(`${nome}: ${e}`));
  avisos.forEach((a) => errosGlobais.push(`${nome} (aviso): ${a}`));
  passes[nome] = questoes;
  console.log(`${nome}: ${paginas.length} páginas → ${questoes.size} questões`);
}
// Segunda testemunha barata: o texto do OCR de cada página (ocr.mjs). Serve de
// substituto do segundo passe de IA no crivo de consenso — não para diff
// estrito, mas para cobertura: o que a IA transcreveu tem que ter eco no OCR.
const ocrPorPagina = new Map();
const dirOcr = join(dir, 'ocr');
if (existsSync(dirOcr)) {
  for (const f of readdirSync(dirOcr).filter((x) => /^p\d{3}\.txt$/.test(x))) {
    const num = parseInt(f.slice(1, 4), 10);
    const texto = readFileSync(join(dirOcr, f), 'utf-8');
    // Página com pouco texto reconhecido não é testemunha de nada.
    if (texto.replace(/\s/g, '').length >= 200) ocrPorPagina.set(num, texto);
  }
}
const TEM_OCR = ocrPorPagina.size > 0;

// Lacunas resolvidas por zoom (zoom-lacunas.mjs). Os agentes escrevem um lote
// cada; aqui os lotes são unidos.
const zoom = new Map();
const dirLacunas = join(dir, 'lacunas');
if (existsSync(dirLacunas)) {
  for (const f of readdirSync(dirLacunas).filter((x) => /^resolvidas.*\.json$/.test(x))) {
    let dados;
    try {
      dados = JSON.parse(readFileSync(join(dirLacunas, f), 'utf-8'));
    } catch (e) {
      errosGlobais.push(`lacunas/${f}: JSON inválido — ${e.message}`);
      continue;
    }
    for (const [numero, campos] of Object.entries(dados)) {
      zoom.set(Number(numero), { ...(zoom.get(Number(numero)) ?? {}), ...campos });
    }
  }
}
if (zoom.size > 0) console.log(`lacunas resolvidas por zoom: ${zoom.size} questões`);

if (UM_PASSE) {
  console.log('\n⚠ MODO DE UM PASSE — o crivo de consenso entre passes de IA não roda.');
  if (TEM_OCR) {
    console.log(`  Usando o OCR de ${ocrPorPagina.size} páginas como segunda testemunha.`);
  } else {
    console.log('  Sem OCR disponível: rode `node ocr.mjs <dir>` para ter uma segunda');
    console.log('  testemunha de graça, em vez de pagar um segundo passe de IA.');
  }
  console.log('');
}

const numerosGabarito = Object.keys(gabarito).map(Number).sort((a, b) => a - b);

// ──── Validação questão a questão ────

const registros = [];

for (const numero of numerosGabarito) {
  const q1 = passes.passe1.get(numero) ?? null;
  const q2 = passes.passe2.get(numero) ?? null;
  const dev = devolutiva[String(numero)] ?? null;
  const letraOficial = gabarito[String(numero)];

  const flags = [];
  const flag = (severidade, codigo, detalhe) => flags.push({ severidade, codigo, detalhe });

  // O passe 1 é a base; o passe 2 serve de testemunha independente.
  const base = q1 || q2 ? estruturarBase(q1 ?? q2) : null;

  // ── Resolução do gabarito: a devolutiva manda ──
  // Regra de negócio: a devolutiva comentada vale mais que a folha de gabarito
  // seca. Onde as duas discordam, a troca é automática e apenas registrada —
  // não bloqueia. Na TPI 2025.1 é o caso da Q93: folha diz B, devolutiva diz
  // "letra A", e vale A.
  // Roda antes dos crivos de transcrição porque o caminho pela letra declarada
  // não depende do scan.
  const resolucao = resolverGabarito(letraOficial, dev, base?.alternativas ?? {},
    { confirma: CONFIRMA, duvida: DUVIDA });
  const letraEfetiva = resolucao.letra;
  if (resolucao.divergiu) {
    flag('media', 'gabarito_ajustado_pela_devolutiva',
      `folha de gabarito diz ${letraOficial}, devolutiva diz ${letraEfetiva} — vale a devolutiva ` +
      `(${resolucao.origem === 'devolutiva_letra'
        ? 'ela nomeia a letra'
        : `o texto da resposta declarada casa com a alternativa ${letraEfetiva.toLowerCase()}`})`);
  }
  if (resolucao.conflito) {
    flag('alta', 'devolutiva_inconsistente',
      `a devolutiva nomeia a letra ${resolucao.conflito.letra_declarada} mas o texto que ela ` +
      `declara como correto é a alternativa ${resolucao.conflito.letra_por_texto} — a fonte se ` +
      `contradiz; em uso está ${resolucao.conflito.letra_por_texto} (o texto é mais confiável ` +
      'que a letra), confirme no scan');
  }

  if (!q1 && !q2) {
    flag('alta', 'nao_transcrita', 'questão ausente nos dois passes');
    registros.push({
      numero,
      letra_oficial: letraEfetiva ?? null,
      letra_folha: letraOficial ?? null,
      gabarito_origem: resolucao.origem,
      paginas: [],
      alternativas: {},
      enunciado: '',
      enunciado_apoio: '',
      flags: flags.sort((a, b) => SEV[b.severidade] - SEV[a.severidade]),
      severidade_max: 'alta',
    });
    continue;
  }
  // A severidade da falta de consenso só pode ser decidida depois do crivo 3:
  // onde a devolutiva confirma a resposta, o segundo passe é quase redundante;
  // onde não confirma, é a única rede que sobra.
  const semConsenso = !q1 || !q2;

  // ── Crivo 2: consenso entre passes ──
  const comparacao = { campos: {}, alternativas: {} };
  if (q1 && q2) {
    // O ponto de corte apoio/enunciado é uma decisão de julgamento; comparar
    // o texto concatenado evita divergência espúria por corte diferente.
    const inteiro = (q) => colapsar(`${q.enunciado_apoio} ${q.enunciado}`);
    const acordoTexto = compararCampo(inteiro(q1), inteiro(q2));
    comparacao.campos.enunciado_completo = acordoTexto;
    if (acordoTexto === 'divergente') {
      flag('alta', 'divergencia_enunciado', diffPalavras(inteiro(q1), inteiro(q2)));
    } else if (acordoTexto === 'equivalente') {
      flag('baixa', 'divergencia_acentuacao_enunciado', diffPalavras(inteiro(q1), inteiro(q2)));
    }

    if (colapsar(q1.enunciado) !== colapsar(q2.enunciado) && acordoTexto !== 'divergente') {
      flag('baixa', 'corte_apoio_divergente',
        'os passes dividiram apoio/pergunta em pontos diferentes — texto total idêntico');
    }

    const letras = new Set([...Object.keys(q1.alternativas), ...Object.keys(q2.alternativas)]);
    for (const letra of [...letras].sort()) {
      const a = q1.alternativas[letra] ?? '';
      const b = q2.alternativas[letra] ?? '';
      const acordo = compararCampo(a, b);
      comparacao.alternativas[letra] = acordo;
      if (!a || !b) {
        flag('alta', 'alternativa_so_em_um_passe', `alternativa ${letra} só existe no ${a ? 'passe1' : 'passe2'}`);
      } else if (acordo === 'divergente') {
        flag('alta', 'divergencia_alternativa', `${letra}: ${diffPalavras(a, b)}`);
      } else if (acordo === 'equivalente') {
        flag('baixa', 'divergencia_acentuacao_alternativa', `${letra}: ${diffPalavras(a, b)}`);
      }
    }

    if (Boolean(q1.tem_imagem) !== Boolean(q2.tem_imagem)) {
      flag('media', 'imagem_divergente', 'um passe viu imagem embutida e o outro não');
    }
  }

  // ── Crivo 1: estrutura ──
  const presentes = LETRAS.filter((l) => base.alternativas[l]);
  const faltando = LETRAS.filter((l) => !base.alternativas[l]);
  if (faltando.length > 0) {
    flag('alta', 'alternativas_faltando', `sem texto: ${faltando.join(', ')}`);
  }
  if (!base.enunciado) {
    flag('alta', 'enunciado_vazio', 'nenhuma pergunta final transcrita');
  }
  if (colapsar(`${base.enunciado_apoio} ${base.enunciado}`).length < 40) {
    flag('alta', 'enunciado_curto', 'enunciado com menos de 40 caracteres');
  }
  for (let i = 0; i < presentes.length; i += 1) {
    for (let j = i + 1; j < presentes.length; j += 1) {
      if (colapsar(base.alternativas[presentes[i]]) === colapsar(base.alternativas[presentes[j]])) {
        flag('alta', 'alternativas_identicas', `${presentes[i]} e ${presentes[j]} têm texto idêntico`);
      }
    }
  }
  if (!letraEfetiva) {
    flag('alta', 'sem_gabarito_oficial', 'questão ausente na folha de gabarito');
  } else if (!base.alternativas[letraEfetiva.toLowerCase()]) {
    flag('alta', 'gabarito_sem_alternativa',
      `gabarito é ${letraEfetiva} mas a alternativa ${letraEfetiva.toLowerCase()} não foi transcrita`);
  }
  if (base.costurada) {
    flag('baixa', 'questao_costurada', `remontada de ${base.paginas.length} páginas (${base.paginas.join(', ')})`);
  }
  for (const letra of base.alternativas_costuradas) {
    flag('media', 'alternativa_costurada',
      `alternativa ${letra} foi partida pela quebra de página e remontada — confira a junção`);
  }

  // ── Crivo 3: cruzamento com a devolutiva oficial ──
  //
  // A força deste crivo varia por questão, e o relatório diz exatamente
  // quanta verificação cada uma recebeu. Três níveis:
  //
  //   forte    — a devolutiva declara a letra correta: confere o gabarito
  //              oficial diretamente.
  //   media    — a devolutiva declara a frase da resposta correta: confere
  //              qual alternativa é a certa, logo também a ordem delas.
  //   presenca — só dá para conferir que cada alternativa existe no texto
  //              oficial. Pega corrupção de OCR, não pega troca de ordem.
  //
  // Nesta prova só 7 de 120 questões têm seção "Distratores:" separada, então
  // na maioria a devolutiva comenta todas as alternativas no mesmo bloco e
  // "qual delas o comentário descreve" simplesmente não é decidível. Fingir
  // que é geraria confirmação falsa.
  const cruzamento = { nivel: 'nenhum', correta: null, distratores: {}, letra_declarada: null };

  if (!dev) {
    flag('media', 'sem_devolutiva', 'questão não tem devolutiva para cruzar');
  } else if (letraEfetiva) {
    const lc = letraEfetiva.toLowerCase();
    const textoCorreta = base.alternativas[lc] ?? '';
    const tkCorreta = tokens(textoCorreta).length;
    const declarado = dev.declarado ?? { afirmacao: null, letra: null };

    // ── Nível forte: a devolutiva nomeia a letra ──
    // Se divergiu da folha, `resolverGabarito` já aplicou a devolutiva e
    // registrou o ajuste, então aqui `letraEfetiva` é sempre a da devolutiva.
    if (declarado.letra) {
      cruzamento.letra_declarada = declarado.letra;
      cruzamento.nivel = 'forte';
    }

    // ── Nível média: a devolutiva transcreve a alternativa correta ──
    if (declarado.afirmacao && tkCorreta >= MIN_TOKENS) {
      const contra = {};
      for (const letra of presentes) {
        contra[letra] = similaridade(base.alternativas[letra], declarado.afirmacao);
      }
      const simCorreta = contra[lc] ?? 0;
      const rival = presentes
        .filter((l) => l !== lc)
        .reduce((m, l) => (contra[l] > (contra[m] ?? -1) ? l : m), null);
      const simRival = rival ? contra[rival] : 0;

      cruzamento.correta = { letra: lc, sim_afirmacao: simCorreta, por_letra: contra };

      if (simRival > simCorreta + DUVIDA) {
        // Chegar aqui significa que `resolverGabarito` NÃO conseguiu decidir
        // (não houve margem sobre a segunda colocada, ou o texto declarado não
        // atingiu o limiar de confirmação). Sobra revisão humana.
        flag('alta', 'gabarito_contradito',
          `a devolutiva declara como correta a alternativa ${rival} (${simRival}), não a ${lc} em uso ` +
          `(${simCorreta}), e a margem não foi suficiente para trocar automaticamente — ` +
          'provável troca de ordem das alternativas ou texto transcrito errado');
      } else if (simCorreta >= CONFIRMA) {
        if (cruzamento.nivel !== 'forte') cruzamento.nivel = 'media';
      } else if (simCorreta < DUVIDA) {
        flag('media', 'gabarito_nao_confirmado',
          `a devolutiva declara a resposta correta ("${resumir(declarado.afirmacao)}") mas ela não casa com a ` +
          `alternativa ${lc} transcrita (${simCorreta}) — confira o texto contra o scan`);
      }
    }

    // ── Nível presença: rede contra corrupção de OCR ──
    // `similaridadeVocabulario` é robusta a reescrita, então valor baixo aqui
    // significa que o texto transcrito não existe no PDF oficial.
    for (const letra of presentes) {
      const presenca = Math.max(
        similaridade(base.alternativas[letra], dev.bruto),
        similaridadeVocabulario(base.alternativas[letra], dev.bruto),
      );
      cruzamento.distratores[letra] = presenca;

      // A guarda de tokens vale só para distratores, onde paráfrase gera
      // ruído. Para a alternativa correta qualquer token conta: a devolutiva
      // sempre discute a resposta certa, então ausência ali é erro de leitura.
      // Sem essa distinção, "Laparotomia exploradora" corrompida em
      // "Laparotomla explaradora" (2 tokens) passaria batido.
      const minimo = letra === lc ? 1 : 3;
      if (tokens(base.alternativas[letra]).length < minimo) continue;
      if (presenca >= DUVIDA) continue;

      if (letra === lc) {
        flag('media', 'correta_ausente_na_devolutiva',
          `a alternativa ${letra} (a do gabarito) não aparece na devolutiva (${presenca}) — ` +
          'forte indício de erro de transcrição');
      } else {
        flag('baixa', 'alternativa_ausente_na_devolutiva',
          `alternativa ${letra} não aparece na devolutiva (${presenca}) — pode ser distrator não comentado ` +
          'ou erro de leitura');
      }
    }

    if (cruzamento.nivel === 'nenhum') {
      cruzamento.nivel = 'presenca';
      if (tkCorreta < MIN_TOKENS) {
        flag('media', 'cruzamento_inaplicavel',
          `alternativa ${lc} tem ${tkCorreta} token(s) útil(eis) — o cruzamento com a devolutiva não se aplica ` +
          '(típico de questão com assertivas I/II/III); esta questão depende só do consenso entre os dois passes');
      }
    }
  }

  // ── Preenchimento automático dos trechos ilegíveis ──
  // Roda antes dos crivos de conteúdo para que eles avaliem o texto já
  // completo. A devolutiva é a única fonte usada: medido nesta prova, ela
  // acertou 7 de 7, enquanto o OCR acertou 2 de 8 — o ponto está ilegível na
  // foto, então o OCR erra exatamente ali também.
  const lacunas = { preenchidas: [], pendentes: 0 };

  // Resolução por zoom (zoom-lacunas.mjs + agente lendo as faixas em resolução
  // nativa) tem prioridade: veio de olhar o pixel, não de casar contexto.
  // `modo: "deduzido"` significa que os caracteres estão fora da foto — cortados
  // pela borda — e a palavra foi completada pelo fragmento visível. Isso é
  // dedução, não leitura, então recebe severidade maior para você poder auditar.
  const doZoom = zoom.get(numero);
  if (doZoom) {
    for (const [campo, info] of Object.entries(doZoom)) {
      const alvo = campo.startsWith('alternativa ')
        ? { obj: base.alternativas, chave: campo.slice(12).trim() }
        : { obj: base, chave: campo };
      if (alvo.obj[alvo.chave] === undefined) continue;

      // Trava contra resolução que mexeu além da lacuna. Caso real: um agente
      // devolveu a Q13 sem "Considerando o quadro clínico do" no começo do
      // enunciado. Prompt não garante isso; conferência mecânica garante.
      const veredito = validarResolucao(alvo.obj[alvo.chave], info.texto);
      if (!veredito.ok) {
        flag('alta', 'resolucao_zoom_rejeitada',
          `${campo}: resolução automática descartada — ${veredito.motivo}`);
        continue;
      }

      alvo.obj[alvo.chave] = info.texto;
      lacunas.preenchidas.push({
        campo,
        fonte: info.modo === 'deduzido' ? 'zoom (deduzido)' : 'zoom (lido)',
        trecho: (info.trechos ?? []).join(' · '),
        candidato: '—',
        contexto: '',
        deduzido: info.modo === 'deduzido',
      });
    }
  }

  if (dev?.bruto) {
    const fontes = [{ nome: 'devolutiva', texto: dev.bruto }];
    for (const campo of ['enunciado_apoio', 'enunciado']) {
      const r = preencherLacunas(base[campo], fontes);
      base[campo] = r.texto;
      lacunas.preenchidas.push(...r.preenchimentos.map((p) => ({ campo, ...p })));
      lacunas.pendentes += r.pendentes;
    }
    for (const letra of presentes) {
      const r = preencherLacunas(base.alternativas[letra], fontes);
      base.alternativas[letra] = r.texto;
      lacunas.preenchidas.push(...r.preenchimentos.map((p) => ({ campo: `alternativa ${letra}`, ...p })));
      lacunas.pendentes += r.pendentes;
    }
  }
  for (const p of lacunas.preenchidas) {
    // Texto deduzido não é texto verificado: fica em média para aparecer no
    // relatório e poder ser auditado, mas não bloqueia a importação.
    flag(p.deduzido ? 'media' : 'baixa',
      p.deduzido ? 'lacuna_deduzida' : 'lacuna_preenchida',
      `${p.campo}: trecho ilegível resolvido via ${p.fonte} como "${p.trecho}"` +
      `${p.candidato !== '—' ? ` (palavra "${p.candidato}")` : ''}${p.contexto}`);
  }

  // ── Crivo 2b: OCR como segunda testemunha ──
  // Cobertura, não diff: o OCR desta prova não acerta layout, mas se um trecho
  // que a IA transcreveu não tem eco nenhum no OCR da mesma página, é forte
  // indício de leitura inventada. `similaridadeVocabulario` é usada porque é
  // robusta a ruído de OCR (glifo trocado quebra bigrama, não o vocabulário).
  const ocr = { disponivel: false, campos: {} };
  const textoOcr = (base.paginas ?? [])
    .map((p) => ocrPorPagina.get(p))
    .filter(Boolean)
    .join('\n');

  if (textoOcr) {
    ocr.disponivel = true;
    // O apoio entra aqui porque é o maior bloco de texto da questão — deixá-lo
    // de fora tirava a única testemunha possível das questões de assertiva
    // ("É correto o que se afirma em:" + "II e IV, apenas"), onde nem o
    // enunciado nem as alternativas têm tokens suficientes para conferir.
    const aConferir = [
      ['enunciado_apoio', base.enunciado_apoio],
      ['enunciado', base.enunciado],
      ...presentes.map((l) => [`alternativa ${l}`, base.alternativas[l]]),
    ];
    for (const [nome, texto] of aConferir) {
      if (!texto || tokens(texto).length < 3) continue;
      const eco = similaridadeVocabulario(texto, textoOcr);
      ocr.campos[nome] = eco;
      if (eco < OCR_ECO) {
        flag('media', 'sem_eco_no_ocr',
          `${nome}: o OCR da página não tem eco deste texto (${eco}) — confira contra o scan`);
      }
    }
  }

  // ── Falta de consenso, graduada pelo que as outras testemunhas confirmam ──
  if (semConsenso) {
    const cruzada = cruzamento.nivel === 'forte' || cruzamento.nivel === 'media';
    // Confirmação pelo OCR: todos os campos conferíveis tiveram eco.
    const valoresOcr = Object.values(ocr.campos);
    const ocrConfirma = valoresOcr.length > 0 && valoresOcr.every((v) => v >= OCR_ECO);

    if (cruzada && ocrConfirma) {
      flag('baixa', 'sem_segundo_passe_ia',
        'só um passe de IA, mas a devolutiva confirma a alternativa correta e o OCR confirma ' +
        'o texto — duas testemunhas independentes, o segundo passe seria redundante');
    } else if (ocrConfirma) {
      flag('media', 'sem_consenso_mas_ocr',
        'só um passe de IA; o OCR da página confirma o texto transcrito, mas a devolutiva não ' +
        'confirma qual é a alternativa correta');
    } else if (cruzada) {
      flag('media', 'sem_consenso_mas_cruzada',
        'só um passe de IA; a devolutiva confirma a alternativa correta, mas o texto não tem ' +
        'segunda testemunha (sem OCR utilizável nesta página)');
    } else {
      flag('alta', 'sem_consenso',
        `só um passe de IA e nenhuma outra testemunha confirma (cruzamento ${cruzamento.nivel}` +
        `${ocr.disponivel ? ', OCR não confirmou' : ', sem OCR'}) — precisa de revisão manual`);
    }
  }

  // ── Crivo 4: integridade de caracteres e truncamento ──
  const campos = [
    ['enunciado_apoio', base.enunciado_apoio],
    ['enunciado', base.enunciado],
    ...presentes.map((l) => [`alternativa ${l}`, base.alternativas[l]]),
  ];

  for (const [nome, texto] of campos) {
    if (!texto) continue;
    if (/[�]/.test(texto)) {
      flag('alta', 'caractere_invalido', `${nome}: contém caractere de substituição (�)`);
    }
    if (/\[\?\]|\[ilegível\]|\[ilegivel\]/i.test(texto)) {
      flag('alta', 'trecho_ilegivel', `${nome}: transcritor marcou trecho ilegível`);
    }
    const abre = (texto.match(/[(\[]/g) ?? []).length;
    const fecha = (texto.match(/[)\]]/g) ?? []).length;
    if (abre !== fecha) {
      flag('media', 'parenteses_desbalanceados', `${nome}: ${abre} de abertura, ${fecha} de fechamento`);
    }
    const gigante = colapsar(texto).split(' ').find((p) => p.replace(/\W/g, '').length > 28);
    if (gigante) {
      flag('media', 'palavra_colada', `${nome}: "${gigante}" — provável perda de espaço`);
    }
    if (/[-–]$/.test(texto.trim())) {
      flag('media', 'texto_truncado', `${nome}: termina em hífen`);
    }
  }

  if (base.enunciado && !/[.:?!]["')\]]?$/.test(base.enunciado.trim())) {
    flag('media', 'enunciado_sem_pontuacao_final',
      'a pergunta não termina em pontuação — pode estar truncada');
  }
  for (const letra of presentes) {
    const t = base.alternativas[letra];
    if (colapsar(t).length < 8) {
      flag('media', 'alternativa_muito_curta', `alternativa ${letra}: "${t}"`);
    }
  }

  // Severidade média, não alta: o texto da questão está verificado como
  // qualquer outra, só a figura não viaja pelo markdown do admin. Bloquear a
  // importação por isso deixaria a questão de fora em vez de entrar sem a
  // imagem — e `PENDENCIAS.md` já garante que ela não seja esquecida.
  // Tabela achatada em texto corrido: o transcritor não tem como preservar a
  // grade, então a questão entra com a tabela ilegível e precisa ser remontada
  // à mão no admin. Detectado por marcadores de tabela no texto de apoio.
  const apoio = base.enunciado_apoio ?? '';
  const barras = (apoio.match(/\|/g) ?? []).length;
  const separadores = (apoio.match(/ \/ /g) ?? []).length;
  const temRotulo = /\b(tabela|quadro|gr[áa]fico)\b\s*:/i.test(apoio);
  if (temRotulo || barras >= 3 || separadores >= 5) {
    base.tem_tabela = true;
    flag('media', 'tabela_complexa',
      'o texto de apoio traz tabela/quadro achatado em texto corrido ' +
      `(${temRotulo ? 'rótulo de tabela' : `${barras} barras, ${separadores} separadores`}) — ` +
      'remonte a formatação em /admin/questoes depois de importar');
  }

  if (base.tem_imagem) {
    flag('media', 'precisa_imagem',
      'questão tem imagem embutida (gráfico/exame) — o markdown do admin não carrega imagem, ' +
      'anexe manualmente em /admin/questoes depois de importar (ver PENDENCIAS.md)');
  }
  for (const obs of base.observacoes) {
    flag('media', 'observacao_do_transcritor', obs);
  }

  registros.push({
    numero,
    // Gabarito em uso: já resolvido pela regra "devolutiva vale mais que a
    // folha". `letra_folha` e `gabarito_origem` ficam para auditoria.
    letra_oficial: letraEfetiva ?? null,
    letra_folha: letraOficial ?? null,
    gabarito_origem: resolucao.origem,
    paginas: base.paginas,
    peso: base.peso,
    fonte_original: base.fonte_original,
    enunciado_apoio: base.enunciado_apoio,
    enunciado: base.enunciado,
    alternativas: base.alternativas,
    tem_imagem: base.tem_imagem,
    tem_tabela: base.tem_tabela ?? false,
    imagem_topo_pct: base.imagem_topo_pct,
    imagem_base_pct: base.imagem_base_pct,
    posicao_topo_pct: base.posicao_topo_pct,
    explicacao: dev ? montarExplicacao(dev) : null,
    referencia: dev?.referencias || null,
    classificacao_sugerida: dev?.classificacao ?? null,
    alternativas_passe2: passes.passe2.get(numero)?.alternativas ?? null,
    enunciado_passe2: passes.passe2.get(numero)
      ? {
          enunciado_apoio: passes.passe2.get(numero).enunciado_apoio,
          enunciado: passes.passe2.get(numero).enunciado,
        }
      : null,
    comparacao,
    cruzamento,
    ocr,
    lacunas,
    flags: flags.sort((a, b) => SEV[b.severidade] - SEV[a.severidade]),
    severidade_max: flags.length === 0 ? null
      : flags.reduce((m, f) => (SEV[f.severidade] > SEV[m] ? f.severidade : m), 'baixa'),
  });
}

// ──── Cobertura global ────

const transcritas = new Set([...passes.passe1.keys(), ...passes.passe2.keys()]);
const extras = [...transcritas].filter((n) => !gabarito[String(n)]).sort((a, b) => a - b);
const avisosGlobais = [];
if (extras.length > 0) {
  const msg = `questões transcritas que não existem no gabarito oficial: ${extras.join(', ')}`;
  (extrasOk ? avisosGlobais : errosGlobais).push(msg);
}

// ──── Relatório ────

const conta = (sev) => registros.filter((r) => r.severidade_max === sev).length;
const limpas = registros.filter((r) => r.flags.length === 0).length;

const porCodigo = new Map();
for (const r of registros) {
  for (const f of r.flags) {
    if (!porCodigo.has(f.codigo)) porCodigo.set(f.codigo, { severidade: f.severidade, questoes: [] });
    porCodigo.get(f.codigo).questoes.push(r.numero);
  }
}

const nivel = (n) => registros.filter((r) => (r.cruzamento?.nivel ?? 'nenhum') === n).length;
const cobertura = {
  forte: nivel('forte'),
  media: nivel('media'),
  presenca: nivel('presenca'),
  nenhum: nivel('nenhum'),
};

const resultado = {
  dir,
  validado_em: new Date().toISOString(),
  total: registros.length,
  limpas,
  por_severidade: { alta: conta('alta'), media: conta('media'), baixa: conta('baixa') },
  cobertura_cruzamento: cobertura,
  erros_globais: errosGlobais,
  avisos_globais: avisosGlobais,
  limiares: { CONFIRMA, DUVIDA, MIN_TOKENS, OCR_ECO },
  questoes: registros,
};

writeFileSync(join(dir, 'validacao.json'), JSON.stringify(resultado, null, 2) + '\n', 'utf-8');

const md = [];
md.push('# Relatório de validação\n');
md.push(`Prova: \`${manifesto.pdf}\`  \nQuestões: ${registros.length}\n`);
md.push('| categoria | questões |');
md.push('| --- | --- |');
md.push(`| sem nenhuma flag | ${limpas} |`);
md.push(`| flag alta (revisão obrigatória) | ${conta('alta')} |`);
md.push(`| flag média | ${conta('media')} |`);
md.push(`| flag baixa | ${conta('baixa')} |`);
md.push('');
md.push('## Quanta verificação cada questão recebeu\n');
md.push(
  'O cruzamento com a devolutiva não tem a mesma força em toda questão. Esta tabela ' +
  'diz o que foi de fato conferido — não confunda "sem flag" com "verificado a fundo".\n',
);
md.push('| nível | o que foi conferido | questões |');
md.push('| --- | --- | --- |');
md.push(`| forte | a devolutiva nomeia a letra correta e ela bate com a folha de gabarito | ${cobertura.forte} |`);
md.push(`| média | a devolutiva transcreve a resposta correta e ela bate com a alternativa do gabarito | ${cobertura.media} |`);
md.push(`| presença | só foi possível conferir que as alternativas existem no texto oficial (pega OCR corrompido, não pega troca de ordem) | ${cobertura.presenca} |`);
md.push(`| nenhum | sem devolutiva ou sem transcrição | ${cobertura.nenhum} |`);
md.push('');
md.push(
  'Nas questões de nível **presença**, a garantia de que a alternativa correta é a certa vem ' +
  'do gabarito oficial (determinístico) e do consenso entre os dois passes de transcrição — ' +
  'não de uma confirmação semântica.\n',
);

const ajustadas = registros.filter((r) => r.gabarito_origem && r.gabarito_origem !== 'folha');
const trocadas = ajustadas.filter((r) => r.letra_folha && r.letra_oficial !== r.letra_folha);
md.push('## Gabarito: devolutiva acima da folha\n');
md.push(
  'A devolutiva comentada vale mais que a folha de gabarito seca. Onde as duas discordam, ' +
  'vale a devolutiva e a troca é aplicada automaticamente.\n',
);
md.push(`- questões cujo gabarito veio da devolutiva: **${ajustadas.length}**`);
md.push(`- delas, discordavam da folha e foram trocadas: **${trocadas.length}**`);
if (trocadas.length > 0) {
  md.push('');
  md.push('| questão | folha | devolutiva (em uso) | origem |');
  md.push('| --- | --- | --- | --- |');
  for (const r of trocadas) {
    md.push(`| ${r.numero} | ${r.letra_folha} | **${r.letra_oficial}** | \`${r.gabarito_origem}\` |`);
  }
}
md.push('');

if (errosGlobais.length > 0) {
  md.push('## Erros globais\n');
  errosGlobais.forEach((e) => md.push(`- ${e}`));
  md.push('');
}
if (avisosGlobais.length > 0) {
  md.push('## Avisos globais (rebaixados por --extras-ok)\n');
  avisosGlobais.forEach((a) => md.push(`- ${a}`));
  md.push('');
}

md.push('## Flags por código\n');
md.push('| código | severidade | qtd | questões |');
md.push('| --- | --- | --- | --- |');
for (const [codigo, info] of [...porCodigo.entries()].sort(
  (a, b) => SEV[b[1].severidade] - SEV[a[1].severidade] || b[1].questoes.length - a[1].questoes.length,
)) {
  const lista = info.questoes.length > 24
    ? `${info.questoes.slice(0, 24).join(', ')} … (+${info.questoes.length - 24})`
    : info.questoes.join(', ');
  md.push(`| \`${codigo}\` | ${info.severidade} | ${info.questoes.length} | ${lista} |`);
}
md.push('');

// Alvo do passe 2: as páginas das questões em que nem o consenso nem o
// cruzamento verificam nada. Rodar o passe 2 só nelas é o gasto mínimo para
// fechar a verificação.
if (UM_PASSE) {
  const precisam = registros.filter((r) => r.flags.some((f) => f.codigo === 'sem_consenso'));
  const paginasAlvo = [...new Set(precisam.flatMap((r) => r.paginas ?? []))].sort((a, b) => a - b);
  const SUPRIDAS = new Set(['sem_segundo_passe_ia', 'sem_consenso_mas_ocr', 'sem_consenso_mas_cruzada']);
  const supridas = registros.filter((r) => r.flags.some((f) => SUPRIDAS.has(f.codigo)));

  md.push('## Onde ainda falta testemunha\n');
  md.push(
    'Rodou só um passe de transcrição. Onde a devolutiva confirma qual alternativa é a ' +
    'correta, o segundo passe é quase redundante. Onde não confirma, ele é a única rede.\n',
  );
  md.push(`- questões com testemunha alternativa (OCR e/ou devolutiva): **${supridas.length}**`);
  md.push(`- questões sem testemunha nenhuma: **${precisam.length}**`);
  md.push(`- páginas a retranscrever: **${paginasAlvo.length}** de ${indicePaginas.length}`);
  md.push('');
  if (paginasAlvo.length > 0) {
    md.push('```');
    md.push(paginasAlvo.join(' '));
    md.push('```');
    md.push('');
    md.push(`Questões: ${precisam.map((r) => r.numero).join(', ')}\n`);
  }

  console.log('');
  console.log(`com testemunha alternativa : ${supridas.length}`);
  console.log(`sem testemunha nenhuma     : ${precisam.length}`);
  console.log(`páginas a retranscrever    : ${paginasAlvo.length} de ${indicePaginas.length}`);
  if (paginasAlvo.length > 0) console.log(`  ${paginasAlvo.join(' ')}`);
}

const criticas = registros.filter((r) => r.severidade_max === 'alta');
if (criticas.length > 0) {
  md.push('## Detalhe das questões com flag alta\n');
  for (const r of criticas) {
    md.push(`### Questão ${r.numero} — gabarito oficial **${r.letra_oficial}** (p. ${r.paginas?.join(', ')})\n`);
    for (const f of r.flags.filter((f) => f.severidade === 'alta')) {
      md.push(`- **\`${f.codigo}\`** — ${f.detalhe}`);
    }
    md.push('');
  }
}

writeFileSync(join(dir, 'relatorio-validacao.md'), md.join('\n'), 'utf-8');

console.log('');
console.log(`total          : ${registros.length}`);
console.log(`sem flag       : ${limpas}`);
console.log(`flag alta      : ${conta('alta')}`);
console.log(`flag média     : ${conta('media')}`);
console.log(`flag baixa     : ${conta('baixa')}`);
console.log('');
console.log(`cruzamento forte    : ${cobertura.forte}  (devolutiva nomeia a letra)`);
console.log(`cruzamento média    : ${cobertura.media}  (devolutiva transcreve a resposta)`);
console.log(`cruzamento presença : ${cobertura.presenca}  (só confere que a alternativa existe)`);
console.log(`sem cruzamento      : ${cobertura.nenhum}`);
const nAjustadas = registros.filter((r) => r.gabarito_origem && r.gabarito_origem !== 'folha').length;
const nTrocadas = registros.filter((r) => r.letra_folha && r.letra_oficial !== r.letra_folha).length;
console.log('');
console.log(`gabarito da devolutiva : ${nAjustadas}  (dos quais ${nTrocadas} discordavam da folha e foram trocados)`);
if (errosGlobais.length > 0) {
  console.log(`\nerros globais  : ${errosGlobais.length}`);
  errosGlobais.slice(0, 12).forEach((e) => console.log(`  • ${e}`));
  if (errosGlobais.length > 12) console.log(`  … (+${errosGlobais.length - 12})`);
}
console.log(`\nescrito: validacao.json + relatorio-validacao.md`);

const bloqueia = errosGlobais.length > 0 || conta('alta') > 0;
if (bloqueia) {
  console.log('\n⚠ há flags altas ou erros globais — revise antes de gerar o markdown');
  process.exit(1);
}
console.log('\n✓ nenhuma flag alta — pode gerar o markdown');

// ──── Helpers ────

function estruturarBase(q) {
  return {
    paginas: q.paginas,
    peso: q.peso,
    fonte_original: q.fonte_original,
    enunciado_apoio: q.enunciado_apoio,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
    tem_imagem: q.tem_imagem,
    imagem_topo_pct: q.imagem_topo_pct,
    imagem_base_pct: q.imagem_base_pct,
    posicao_topo_pct: q.posicao_topo_pct,
    observacoes: q.observacoes ?? [],
    costurada: q.costurada,
    alternativas_costuradas: q.alternativas_costuradas ?? [],
  };
}

/** Encurta um trecho para caber na mensagem de flag. */
function resumir(texto, max = 90) {
  const t = colapsar(texto);
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Explicação = comentário + distratores, sem as referências (campo próprio). */
function montarExplicacao(dev) {
  const partes = [];
  if (dev.comentario) partes.push(dev.comentario);
  if (dev.distratores) partes.push(`Distratores:\n\n${dev.distratores}`);
  return partes.join('\n\n') || dev.bruto || null;
}
