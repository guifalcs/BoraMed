/**
 * Resolução do gabarito da questão.
 *
 * Regra de negócio: **a devolutiva comentada vale mais que a folha de gabarito
 * seca.** Onde as duas discordam, a devolutiva ganha, e a troca é automática —
 * não é caso de revisão humana, é a regra.
 */

import { similaridade } from './texto.mjs';

/**
 * Decide qual alternativa é a correta.
 *
 * Dois caminhos, em ordem de força:
 *
 *  1. `devolutiva_letra` — a devolutiva nomeia a letra ("a resposta correta
 *     seria letra A"). Vale direto e não depende da transcrição do scan.
 *
 *  2. `devolutiva_texto` — a devolutiva transcreve o texto da resposta certa.
 *     Vale a alternativa cujo texto casa com ela. Decidir por *texto* em vez de
 *     por letra é o ponto: se as alternativas foram transcritas fora de ordem,
 *     a letra da folha aponta para a errada, mas o texto continua certo.
 *
 *  3. `folha` — nada declarado na devolutiva; vale a folha de gabarito.
 *
 * O caminho 2 exige margem sobre a segunda colocada: empate entre alternativas
 * parecidas não distingue nada e cai de volta na folha, deixando o caso para o
 * crivo de cruzamento sinalizar.
 *
 * @param {string|null} letraFolha letra na folha de gabarito oficial
 * @param {{declarado?: {letra: string|null, afirmacao: string|null}}|null} dev registro da devolutiva
 * @param {Record<string,string>} alternativas texto por letra, minúsculas
 * @param {{confirma: number, duvida: number}} limiares
 * @returns {{letra: string|null, origem: 'devolutiva_letra'|'devolutiva_texto'|'folha', divergiu: boolean, similaridade?: number}}
 */
export function resolverGabarito(letraFolha, dev, alternativas, limiares) {
  const { confirma, duvida } = limiares;
  const folha = letraFolha ? letraFolha.toUpperCase() : null;
  const declarado = dev?.declarado ?? { letra: null, afirmacao: null };

  if (declarado.letra) {
    const letra = declarado.letra.toUpperCase();
    return { letra, origem: 'devolutiva_letra', divergiu: Boolean(folha && letra !== folha) };
  }

  if (declarado.afirmacao) {
    const notas = Object.entries(alternativas ?? {})
      .map(([l, t]) => [l, similaridade(t, declarado.afirmacao)])
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
      };
    }
  }

  return { letra: folha, origem: 'folha', divergiu: false };
}
