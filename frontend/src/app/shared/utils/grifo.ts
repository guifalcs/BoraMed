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

/**
 * Cor do grifo: hex `#rrggbb` minúsculo. É string livre (o aluno escolhe no
 * espectro), não um nome de uma lista fechada — quem trava o formato é
 * `ehCorGrifo`, e quem desenha a regra `::highlight()` correspondente é o
 * `GrifoRenderService`, em tempo de execução.
 */
export type CorGrifo = `#${string}`;

/** Ferramenta ativa: uma cor ou a borracha. O `#` é o que discrimina as duas. */
export type FerramentaGrifo = CorGrifo | 'borracha';

/** Atalhos da paleta. O resto do espectro sai do seletor de cor. */
export const CORES_PADRAO = ['#fde68a', '#a7f3d0', '#bfdbfe', '#fbcfe8'] as const satisfies readonly CorGrifo[];

/** Nome dos presets, só para leitor de tela e tooltip. */
export const NOME_DAS_CORES_PADRAO: Readonly<Record<string, string>> = {
  '#fde68a': 'amarelo',
  '#a7f3d0': 'verde',
  '#bfdbfe': 'azul',
  '#fbcfe8': 'rosa',
};

/** Cores do formato antigo (v1), quando a paleta era uma lista de quatro nomes. */
const CORES_V1: Readonly<Record<string, CorGrifo>> = {
  amarelo: '#fde68a',
  verde: '#a7f3d0',
  azul: '#bfdbfe',
  rosa: '#fbcfe8',
};

const HEX = /^#[0-9a-f]{6}$/;

export function ehCorGrifo(valor: unknown): valor is CorGrifo {
  return typeof valor === 'string' && HEX.test(valor);
}

/**
 * Normaliza o que o seletor de cor devolve (`#AABBCC`, 3 dígitos) para o
 * formato canônico. Devolve `null` para o que não é cor.
 */
export function normalizarCor(valor: string): CorGrifo | null {
  const bruto = valor.trim().toLowerCase();
  const curto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(bruto);
  const hex = curto ? `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}` : bruto;
  return ehCorGrifo(hex) ? hex : null;
}

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

/**
 * Versão do formato salvo. A 2 guarda a cor em hex; a 1 guardava o nome de uma
 * das quatro cores fixas e ainda é lida (ver `lerCor`), nunca escrita.
 */
export const GRIFOS_STORAGE_VERSAO = 2;
const VERSOES_LEGIVEIS = [1, 2];

export interface GrifosSalvos {
  readonly v: number;
  readonly atualizado_em: number;
  /** Grifos por questao_id. */
  readonly questoes: Record<string, Grifo[]>;
}

/**
 * Aceita a cor do formato atual (hex) e a do v1 (nome), traduzindo a segunda.
 * Prova pausada antes da paleta virar espectro não pode perder os grifos.
 */
function lerCor(valor: unknown): CorGrifo | null {
  if (typeof valor !== 'string') return null;
  return CORES_V1[valor] ?? normalizarCor(valor);
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
  if (typeof payload.v !== 'number' || !VERSOES_LEGIVEIS.includes(payload.v)) return vazio;
  if (typeof payload.questoes !== 'object' || payload.questoes === null) return vazio;

  const saida = new Map<string, Grifo[]>();
  for (const [questaoId, lista] of Object.entries(payload.questoes)) {
    if (!Array.isArray(lista)) continue;
    const grifos: Grifo[] = [];
    for (const item of lista) {
      if (typeof item !== 'object' || item === null) continue;
      const g = item as Partial<Grifo>;
      const cor = lerCor(g.cor);
      if (!blocoValido(g.bloco) || cor === null) continue;
      const candidato: Grifo = {
        bloco: g.bloco,
        cor,
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
