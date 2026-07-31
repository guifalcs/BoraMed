/**
 * Resolução do gabarito da questão.
 *
 * Regra de negócio: **a devolutiva comentada vale mais que a folha de gabarito
 * seca.** Onde as duas discordam, a devolutiva ganha, e a troca é automática —
 * não é caso de revisão humana, é a regra.
 */

import { similaridade } from './texto.mjs';

/**
 * Onde a afirmação da resposta correta termina e começa a discussão dos
 * distratores. Sem esse corte, a janela capturada atravessa para a lista de
 * alternativas erradas e pode casar com uma delas.
 *
 * Caso real (TPI 2025.1, Q11): a janela continha "…aumenta as taxas de
 * fertilidade. ALTERNATIVA: Embolização das artérias uterinas. Incorreta: …" e
 * o gabarito foi trocado para uma alternativa explicitamente marcada como
 * incorreta.
 */
const RE_FIM_DA_AFIRMACAO =
  /\b(?:ALTERNATIVAS?\s*:|incorret\w*|errad\w*|distrator\w*|justificativ\w*|coment[áa]rios?\s*:)/i;

/** Recorta a afirmação antes da discussão dos distratores. */
function recortarAfirmacao(afirmacao) {
  const m = afirmacao.match(RE_FIM_DA_AFIRMACAO);
  const recortada = m ? afirmacao.slice(0, m.index) : afirmacao;
  return recortada.trim();
}

/**
 * Decide qual alternativa é a correta.
 *
 * Três caminhos, em ordem de força:
 *
 *  1. `devolutiva_texto` — a devolutiva transcreve o texto da resposta certa e
 *     ele casa com uma alternativa. É o caminho mais forte porque é imune a
 *     alternativa transcrita fora de ordem: onde o texto certo está, ali está
 *     a resposta, independente de que letra a folha aponte.
 *
 *  2. `devolutiva_letra` — a devolutiva nomeia a letra ("a resposta correta
 *     seria letra A"). Mais fraco que o texto: a letra depende de uma ordem que
 *     quem comentou pode ter errado. Caso real (TPI 2025.1, Q93): a devolutiva
 *     diz "letra A, por Incontinência urinária de esforço", mas "de esforço" é
 *     a alternativa B — a letra está errada e o texto está certo.
 *
 *  3. `folha` — nada utilizável na devolutiva; vale a folha de gabarito.
 *
 * O caminho 1 exige margem sobre a segunda colocada: empate entre alternativas
 * parecidas não distingue nada e cai para o caminho seguinte.
 *
 * `conflito` marca que texto e letra da devolutiva discordam entre si. Nesse
 * caso vale o texto, mas o validador sinaliza para revisão — a própria fonte
 * está inconsistente.
 *
 * @param {string|null} letraFolha letra na folha de gabarito oficial
 * @param {{declarado?: {letra: string|null, afirmacao: string|null}}|null} dev registro da devolutiva
 * @param {Record<string,string>} alternativas texto por letra, minúsculas
 * @param {{confirma: number, duvida: number}} limiares
 * @returns {{letra: string|null, origem: 'devolutiva_texto'|'devolutiva_letra'|'folha', divergiu: boolean, conflito?: {letra_declarada: string, letra_por_texto: string}, similaridade?: number}}
 */
export function resolverGabarito(letraFolha, dev, alternativas, limiares) {
  const { confirma, duvida } = limiares;
  const folha = letraFolha ? letraFolha.toUpperCase() : null;
  const declarado = dev?.declarado ?? { letra: null, afirmacao: null };
  const declaradaUpper = declarado.letra ? declarado.letra.toUpperCase() : null;

  // ── 1. Pelo texto da resposta declarada ──
  if (declarado.afirmacao) {
    const afirmacao = recortarAfirmacao(declarado.afirmacao);
    const notas = Object.entries(alternativas ?? {})
      .map(([l, t]) => [l, similaridade(t, afirmacao)])
      .sort((a, b) => b[1] - a[1]);
    const [melhor, sim] = notas[0] ?? [null, 0];
    const segunda = notas[1]?.[1] ?? 0;

    if (melhor && sim >= confirma && sim - segunda > duvida) {
      const letra = melhor.toUpperCase();
      return {
        letra,
        origem: 'devolutiva_texto',
        divergiu: Boolean(folha && letra !== folha),
        similaridade: sim,
        ...(declaradaUpper && declaradaUpper !== letra
          ? { conflito: { letra_declarada: declaradaUpper, letra_por_texto: letra } }
          : {}),
      };
    }
  }

  // ── 2. Pela letra nomeada ──
  if (declaradaUpper) {
    return {
      letra: declaradaUpper,
      origem: 'devolutiva_letra',
      divergiu: Boolean(folha && declaradaUpper !== folha),
    };
  }

  return { letra: folha, origem: 'folha', divergiu: false };
}
