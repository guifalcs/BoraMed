/**
 * Álgebra dos grifos (marca-texto da prova).
 *
 * Um grifo é um intervalo `[inicio, fim)` de caracteres dentro de um bloco de
 * texto da questão (enunciado, texto de apoio, alternativa). Guardar offset em
 * vez de nó do DOM é o que deixa o grifo sobreviver a re-render do Markdown,
 * F5 e troca de questão: o texto é o mesmo, então o intervalo reancora sozinho.
 *
 * Tudo aqui é puro — sem DOM, sem storage. A parte de DOM vive em
 * `grifo-dom.ts` e o estado em `core/services/grifo.service.ts`.
 */

/** Cores do marca-texto. A ordem é a que aparece na paleta. */
export const CORES_GRIFO = ['amarelo', 'verde', 'azul', 'rosa'] as const;

export type CorGrifo = (typeof CORES_GRIFO)[number];

/** Ferramenta ativa na paleta: uma cor ou a borracha. */
export type FerramentaGrifo = CorGrifo | 'borracha';

/**
 * Identificador do bloco de texto dentro da questão. `alt:<id>` isola cada
 * alternativa; `enunciado` e `apoio` são únicos por questão.
 */
export type BlocoGrifo = 'enunciado' | 'apoio' | `alt:${string}`;

export interface Grifo {
  readonly bloco: BlocoGrifo;
  /** Offset inicial (inclusive) no texto do bloco. */
  readonly inicio: number;
  /** Offset final (exclusive) no texto do bloco. */
  readonly fim: number;
  readonly cor: CorGrifo;
}

/** Teto por questão. Grifo é apoio de leitura, não banco de dados. */
export const MAX_GRIFOS_POR_QUESTAO = 200;

function valido(g: Grifo): boolean {
  return Number.isInteger(g.inicio) && Number.isInteger(g.fim) && g.inicio >= 0 && g.fim > g.inicio;
}

/**
 * Ordena e funde grifos vizinhos da mesma cor no mesmo bloco. Sem isso, grifar
 * palavra a palavra numa frase deixaria dezenas de intervalos colados que
 * renderizam igual mas custam memória e storage à toa.
 */
export function normalizarGrifos(grifos: readonly Grifo[]): Grifo[] {
  const ordenados = grifos
    .filter(valido)
    .slice()
    .sort((a, b) => (a.bloco === b.bloco ? a.inicio - b.inicio : a.bloco < b.bloco ? -1 : 1));

  const saida: Grifo[] = [];
  for (const atual of ordenados) {
    const anterior = saida[saida.length - 1];
    const encosta =
      anterior &&
      anterior.bloco === atual.bloco &&
      anterior.cor === atual.cor &&
      atual.inicio <= anterior.fim;

    if (encosta) {
      saida[saida.length - 1] = { ...anterior, fim: Math.max(anterior.fim, atual.fim) };
    } else {
      saida.push(atual);
    }
  }
  return saida;
}

/**
 * Remove o intervalo `[inicio, fim)` dos grifos do bloco — é a borracha, e
 * também o passo que abre espaço para um grifo de outra cor por cima.
 * Um grifo atravessado pelo meio vira dois.
 */
export function apagarTrecho(
  grifos: readonly Grifo[],
  bloco: BlocoGrifo,
  inicio: number,
  fim: number,
): Grifo[] {
  if (fim <= inicio) return grifos.slice();

  const saida: Grifo[] = [];
  for (const g of grifos) {
    if (g.bloco !== bloco || g.fim <= inicio || g.inicio >= fim) {
      saida.push(g);
      continue;
    }
    // Sobra à esquerda do trecho apagado.
    if (g.inicio < inicio) saida.push({ ...g, fim: inicio });
    // Sobra à direita.
    if (g.fim > fim) saida.push({ ...g, inicio: fim });
  }
  return normalizarGrifos(saida);
}

/**
 * Aplica um grifo por cima dos existentes. Regra do marca-texto de verdade: a
 * última passada manda — o que estava embaixo é apagado no trecho coberto,
 * inclusive se for de outra cor.
 */
export function aplicarGrifo(grifos: readonly Grifo[], novo: Grifo): Grifo[] {
  if (!valido(novo)) return grifos.slice();
  const limpos = apagarTrecho(grifos, novo.bloco, novo.inicio, novo.fim);
  const combinados = normalizarGrifos([...limpos, novo]);
  return combinados.slice(0, MAX_GRIFOS_POR_QUESTAO);
}

/** Existe algum grifo no intervalo? Usado para habilitar a borracha/limpar. */
export function temGrifoNoTrecho(
  grifos: readonly Grifo[],
  bloco: BlocoGrifo,
  inicio: number,
  fim: number,
): boolean {
  return grifos.some((g) => g.bloco === bloco && g.inicio < fim && g.fim > inicio);
}

// ---- Serialização (localStorage) ----

/** Versão do formato salvo: um payload de versão diferente é descartado. */
export const GRIFOS_STORAGE_VERSAO = 1;

export interface GrifosSalvos {
  readonly v: number;
  readonly atualizado_em: number;
  /** Grifos por questao_id. */
  readonly questoes: Record<string, Grifo[]>;
}

function corValida(valor: unknown): valor is CorGrifo {
  return typeof valor === 'string' && (CORES_GRIFO as readonly string[]).includes(valor);
}

function blocoValido(valor: unknown): valor is BlocoGrifo {
  return (
    typeof valor === 'string' &&
    (valor === 'enunciado' || valor === 'apoio' || valor.startsWith('alt:'))
  );
}

/**
 * Lê o payload do storage tolerando lixo: qualquer campo estranho derruba só o
 * grifo problemático, nunca a prova inteira.
 */
export function desserializarGrifos(raw: string | null): Map<string, Grifo[]> {
  const vazio = new Map<string, Grifo[]>();
  if (!raw) return vazio;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return vazio;
  }

  if (typeof parsed !== 'object' || parsed === null) return vazio;
  const payload = parsed as Partial<GrifosSalvos>;
  if (payload.v !== GRIFOS_STORAGE_VERSAO) return vazio;
  if (typeof payload.questoes !== 'object' || payload.questoes === null) return vazio;

  const saida = new Map<string, Grifo[]>();
  for (const [questaoId, lista] of Object.entries(payload.questoes)) {
    if (!Array.isArray(lista)) continue;
    const grifos: Grifo[] = [];
    for (const item of lista) {
      if (typeof item !== 'object' || item === null) continue;
      const g = item as Partial<Grifo>;
      if (!blocoValido(g.bloco) || !corValida(g.cor)) continue;
      const candidato: Grifo = {
        bloco: g.bloco,
        cor: g.cor,
        inicio: Number(g.inicio),
        fim: Number(g.fim),
      };
      if (valido(candidato)) grifos.push(candidato);
    }
    if (grifos.length > 0) {
      saida.set(questaoId, normalizarGrifos(grifos).slice(0, MAX_GRIFOS_POR_QUESTAO));
    }
  }
  return saida;
}

export function serializarGrifos(porQuestao: ReadonlyMap<string, readonly Grifo[]>): string {
  const questoes: Record<string, Grifo[]> = {};
  for (const [questaoId, grifos] of porQuestao) {
    if (grifos.length > 0) questoes[questaoId] = grifos.slice();
  }
  const payload: GrifosSalvos = {
    v: GRIFOS_STORAGE_VERSAO,
    atualizado_em: Date.now(),
    questoes,
  };
  return JSON.stringify(payload);
}
