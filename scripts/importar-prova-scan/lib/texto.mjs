/**
 * Utilitários de texto para o pipeline de importação de provas digitalizadas.
 *
 * Tudo aqui é determinístico e sem dependências externas: é a base do
 * cruzamento mecânico entre a transcrição do scan e a devolutiva oficial.
 */

/** Palavras sem valor discriminativo — ignoradas na comparação por tokens. */
const STOPWORDS = new Set([
  'para', 'como', 'pois', 'esse', 'essa', 'este', 'esta', 'isso', 'aquele',
  'aquela', 'sendo', 'seja', 'pelo', 'pela', 'pelos', 'pelas', 'mais', 'menos',
  'muito', 'quando', 'porque', 'entre', 'sobre', 'apenas', 'ainda', 'depois',
  'antes', 'onde', 'todos', 'todas', 'cada', 'suas', 'seus', 'após', 'apos',
  'deve', 'devem', 'pode', 'podem', 'caso', 'casos', 'alternativa', 'alternativas',
  'questao', 'questão', 'correta', 'incorreta', 'correto', 'incorreto',
  'resposta', 'respostas', 'paciente', 'segundo', 'acordo', 'ser', 'que',
]);

/** Remove acentos, pontuação e caixa — forma canônica para comparação. */
export function normalizar(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Só colapsa espaços — preserva acento e pontuação (comparação estrita). */
export function colapsar(s) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Tokens com poder discriminativo: >= 4 caracteres e fora das stopwords. */
export function tokens(s) {
  return normalizar(s)
    .split(' ')
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** Pares de tokens adjacentes — a unidade que dá poder discriminativo. */
function bigramas(lista) {
  const saida = [];
  for (let i = 0; i + 1 < lista.length; i += 1) saida.push(`${lista[i]} ${lista[i + 1]}`);
  return saida;
}

/**
 * Quanto da `agulha` aparece em `palheiro`, medido por bigramas.
 *
 * Bigrama e não saco de palavras porque alternativas de prova médica são
 * desenhadas para diferir minimamente: "Leucemia Linfoide Aguda" e "Leucemia
 * Mieloide Aguda" têm vocabulário quase idêntico, então containment de
 * unigramas dá 1.0 para as duas e não distingue nada. Em bigramas,
 * {leucemia linfoide, linfoide aguda} e {leucemia mieloide, mieloide aguda}
 * não se cruzam.
 *
 * Preço: reescrita com outra ordem de palavras derruba o valor. Por isso o
 * validador usa este número para decidir *qual* alternativa a devolutiva
 * descreve, e `similaridadeVocabulario` para decidir se o texto existe.
 *
 * @returns {number} 0..1
 */
export function similaridade(agulha, palheiro) {
  const a = tokens(agulha);
  if (a.length === 0) return 0;

  const p = tokens(palheiro);
  if (p.length === 0) return 0;

  if (a.length === 1) return p.includes(a[0]) ? 1 : 0;

  const alvo = new Set(bigramas(a));
  const disponiveis = new Set(bigramas(p));
  let acertos = 0;
  for (const b of alvo) if (disponiveis.has(b)) acertos += 1;
  return Number((acertos / alvo.size).toFixed(3));
}

/**
 * Containment de unigramas em janela deslizante — robusto a reescrita, e por
 * isso o detector de corrupção: texto lido errado pelo OCR não casa nem aqui.
 * Não serve para escolher entre alternativas parecidas (ver `similaridade`).
 *
 * @returns {number} 0..1
 */
export function similaridadeVocabulario(agulha, palheiro) {
  const alvo = new Set(tokens(agulha));
  if (alvo.size === 0) return 0;

  const fluxo = tokens(palheiro);
  if (fluxo.length === 0) return 0;

  const tam = Math.max(8, Math.min(fluxo.length, alvo.size * 3));

  // Contagem rolante: `presentes` = quantos tokens distintos de `alvo`
  // estão na janela atual.
  const conta = new Map();
  let presentes = 0;

  const entra = (t) => {
    const c = conta.get(t) ?? 0;
    conta.set(t, c + 1);
    if (c === 0 && alvo.has(t)) presentes += 1;
  };
  const sai = (t) => {
    const c = conta.get(t) ?? 0;
    conta.set(t, c - 1);
    if (c === 1 && alvo.has(t)) presentes -= 1;
  };

  let melhor = 0;
  for (let i = 0; i < fluxo.length; i += 1) {
    entra(fluxo[i]);
    if (i >= tam) sai(fluxo[i - tam]);
    if (i >= tam - 1 || i === fluxo.length - 1) {
      const s = presentes / alvo.size;
      if (s > melhor) melhor = s;
      if (melhor === 1) break;
    }
  }
  return Number(melhor.toFixed(3));
}

/**
 * Desdobra texto extraído de PDF (quebras rígidas de linha) em parágrafos.
 * Junta linhas de continuação e preserva listas, cabeçalhos e enumerações.
 */
export function desdobrar(texto) {
  const linhas = (texto ?? '').split('\n').map((l) => l.trimEnd());
  const paragrafos = [];
  let atual = '';

  const inicioDeBloco = (l) =>
    /^\s*$/.test(l) ||
    /^\s*[-•*✔✓→]/.test(l) ||
    /^\s*(?:[IVXivx]+|\d{1,2}|[a-eA-E])\s*[).]\s/.test(l) ||
    /^\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç ]{2,40}:\s*$/.test(l);

  const fecha = () => {
    if (atual.trim()) paragrafos.push(atual.trim());
    atual = '';
  };

  for (const linha of linhas) {
    if (/^\s*$/.test(linha)) { fecha(); continue; }
    if (inicioDeBloco(linha)) { fecha(); atual = linha.trim(); continue; }
    if (!atual) { atual = linha.trim(); continue; }
    // Cabeçalho terminado em ":" fecha o bloco anterior.
    if (/:$/.test(atual) && atual.length < 45) { fecha(); atual = linha.trim(); continue; }
    // Hifenização de fim de linha: "hipo-" + "hidratado" → "hipohidratado".
    if (/[a-záéíóúâêôãõç]-$/.test(atual) && /^[a-záéíóúâêôãõç]/.test(linha.trim())) {
      atual = atual.slice(0, -1) + linha.trim();
    } else {
      atual += ' ' + linha.trim();
    }
  }
  fecha();

  return paragrafos.join('\n\n');
}

/**
 * Diff palavra a palavra (LCS) em formato compacto para o relatório.
 * Marca remoções como [-x-] e inserções como [+y+].
 */
export function diffPalavras(a, b, contexto = 4) {
  const A = colapsar(a).split(' ').filter(Boolean);
  const B = colapsar(b).split(' ').filter(Boolean);

  // LCS clássico — só roda em questões divergentes, tamanho é irrelevante aqui.
  const m = A.length;
  const n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const partes = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { partes.push({ t: '=', v: A[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { partes.push({ t: '-', v: A[i] }); i += 1; }
    else { partes.push({ t: '+', v: B[j] }); j += 1; }
  }
  while (i < m) { partes.push({ t: '-', v: A[i] }); i += 1; }
  while (j < n) { partes.push({ t: '+', v: B[j] }); j += 1; }

  if (partes.every((p) => p.t === '=')) return '';

  // Colapsa trechos iguais longos, mantendo `contexto` palavras ao redor.
  const saida = [];
  let bufferIgual = [];
  const despejar = (final) => {
    if (bufferIgual.length === 0) return;
    if (bufferIgual.length <= contexto * 2) {
      saida.push(bufferIgual.join(' '));
    } else if (saida.length === 0) {
      saida.push('…' + bufferIgual.slice(-contexto).join(' '));
    } else if (final) {
      saida.push(bufferIgual.slice(0, contexto).join(' ') + '…');
    } else {
      saida.push(`${bufferIgual.slice(0, contexto).join(' ')} … ${bufferIgual.slice(-contexto).join(' ')}`);
    }
    bufferIgual = [];
  };

  for (const p of partes) {
    if (p.t === '=') { bufferIgual.push(p.v); continue; }
    despejar(false);
    saida.push(p.t === '-' ? `[-${p.v}-]` : `[+${p.v}+]`);
  }
  despejar(true);

  return saida.join(' ');
}

/** Classifica o grau de acordo entre duas transcrições do mesmo campo. */
export function compararCampo(a, b) {
  const ca = colapsar(a);
  const cb = colapsar(b);
  if (ca === cb) return 'identico';
  if (normalizar(ca) === normalizar(cb)) return 'equivalente';
  return 'divergente';
}
