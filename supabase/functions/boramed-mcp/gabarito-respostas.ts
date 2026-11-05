// Parser da folha de respostas aceita pelas ferramentas de gabarito do MCP.
// Mesmo contrato do parser do editor (frontend/src/app/core/utils/gabarito-prova.util.ts).

function falhar(mensagem: string): never {
  throw new Error(mensagem)
}

// ── Gabaritos extraoficiais ────────────────────────────────────────────────
// CRUD completo (sem a trava de autoria do MCP, por decisão de produto): o
// Arthur gerencia qualquer gabarito. Tudo passa pelas RPCs de admin com o
// token DO USUÁRIO (userDb), então is_admin() continua sendo a autorização.

export type QuestaoGabarito = { numero: number; resposta: string | null; anulada: boolean; area: string | null; comentario: string | null }

/**
 * "ABCXD?E" → folha. Letra = resposta, X ou * = anulada, ? ou - = em análise.
 * Espaços, vírgulas e quebras de linha são ignorados. Com numeração
 * ("1-A 2-B"), o número define a posição.
 */
export function parseRespostasGabarito(texto: string, qtdAlternativas: number): QuestaoGabarito[] {
  const letras = 'ABCDE'.slice(0, qtdAlternativas)
  const upper = texto.toUpperCase().replace(/ANULADA/g, 'X')
  const marca = (c: string): Pick<QuestaoGabarito, 'resposta' | 'anulada'> =>
    c === 'X' || c === '*' ? { resposta: null, anulada: true } : c === '?' || c === '-' ? { resposta: null, anulada: false } : { resposta: c, anulada: false }
  let marcas: string[]
  if (/\d/.test(upper)) {
    const porNumero = new Map<number, string>()
    for (const m of upper.matchAll(new RegExp(`(\\d+)\\s*[º°ª]?\\s*[-).:–]?\\s*([${letras}X*?\\-])(?![A-Z])`, 'g'))) {
      const n = Number(m[1])
      if (n >= 1 && n <= 200) porNumero.set(n, m[2])
    }
    const max = porNumero.size ? Math.max(...porNumero.keys()) : 0
    marcas = Array.from({ length: max }, (_, i) => porNumero.get(i + 1) ?? '?')
  } else {
    marcas = [...upper.replace(/[\s,;|/]+/g, '')]
    const invalida = marcas.find((c) => !(letras + 'X*?-').includes(c))
    if (invalida) falhar(`Caractere inválido na sequência de respostas: "${invalida}". Use ${letras.split('').join('/')}, X (anulada) ou ? (em análise).`)
  }
  if (marcas.length === 0) falhar('Nenhuma resposta reconhecida na sequência.')
  if (marcas.length > 200) falhar('O gabarito aceita no máximo 200 questões.')
  return marcas.map((c, i) => ({ numero: i + 1, area: null, comentario: null, ...marca(c) }))
}
