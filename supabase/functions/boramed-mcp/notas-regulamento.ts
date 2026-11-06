// Minhas notas via MCP: a IA manda a árvore inteira do regulamento sem ids.
// Para não apagar as notas que os alunos já lançaram, os ids da versão atual
// são herdados casando por nome (eixo pela sigla, dimensão pelo tipo, item e
// subitem pelo nome, sem diferenciar maiúsculas/acentos). O que não casar
// nasce novo; o que sumir é excluído pelo `admin_salvar_notas_regulamento`.

export type TipoDimensao = 'cognitiva' | 'habilidades' | 'unica'

export interface SubitemNota { id?: string; nome: string; pontos: number; descricao?: string | null }
export interface ItemNota extends SubitemNota { subitens?: SubitemNota[] }
export interface DimensaoNota { id?: string; tipo: TipoDimensao; nome?: string; itens: ItemNota[] }
export interface EixoNota { id?: string; sigla: string; nome: string; exame_especial?: boolean; dimensoes: DimensaoNota[] }

export const chaveNome = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')

/** Primeiro de cada nome (os repetidos ficam sem herdar e nascem novos). */
function porNome<T extends { nome: string }>(lista: readonly T[] | undefined): Map<string, T> {
  const m = new Map<string, T>()
  for (const x of lista ?? []) if (!m.has(chaveNome(x.nome))) m.set(chaveNome(x.nome), x)
  return m
}

export function herdarIds(atual: readonly EixoNota[], novo: readonly EixoNota[]): EixoNota[] {
  // Cada id é herdado no máximo uma vez: nomes repetidos (dois "Memorial" no
  // mesmo eixo, por exemplo) não podem apontar para a mesma linha do banco.
  const usados = new Set<string>()
  const herdar = (id: string | undefined): string | undefined => {
    if (!id || usados.has(id)) return undefined
    usados.add(id)
    return id
  }
  const eixos = new Map<string, EixoNota>()
  for (const e of atual) if (!eixos.has(chaveNome(e.sigla))) eixos.set(chaveNome(e.sigla), e)

  return novo.map((e) => {
    const eAtual = eixos.get(chaveNome(e.sigla))
    const eixoId = e.id ?? herdar(eAtual?.id)
    // Sem eixo herdado, nada abaixo dele herda.
    const base = eixoId && eixoId === eAtual?.id ? eAtual : undefined
    return {
      ...e,
      id: eixoId,
      // Omitido pela IA: mantém o que já estava (não zera o exame especial).
      exame_especial: e.exame_especial ?? base?.exame_especial ?? false,
      dimensoes: e.dimensoes.map((d) => {
        const dAtual = base?.dimensoes.find((x) => x.tipo === d.tipo)
        const itens = porNome(dAtual?.itens)
        return {
          ...d,
          id: d.id ?? herdar(dAtual?.id),
          itens: d.itens.map((i) => {
            const iAtual = itens.get(chaveNome(i.nome))
            const subs = porNome(iAtual?.subitens)
            return {
              ...i,
              id: i.id ?? herdar(iAtual?.id),
              subitens: (i.subitens ?? []).map((s) => ({ ...s, id: s.id ?? herdar(subs.get(chaveNome(s.nome))?.id) })),
            }
          }),
        }
      }),
    }
  })
}

/** Confere somas antes de ir ao banco, com mensagem que a IA entende. */
export function conferirSomas(eixos: readonly EixoNota[]): string[] {
  const avisos: string[] = []
  for (const e of eixos) {
    for (const d of e.dimensoes) {
      const total = Math.round(d.itens.reduce((s, i) => s + i.pontos, 0) * 100) / 100
      if (total !== 100) avisos.push(`${e.sigla} · ${d.tipo}: itens somam ${total} (o comum é 100).`)
      for (const i of d.itens) {
        if (i.subitens?.length) {
          const soma = Math.round(i.subitens.reduce((s, x) => s + x.pontos, 0) * 100) / 100
          if (soma !== i.pontos) avisos.push(`${e.sigla} · ${i.nome}: subitens somam ${soma}, item vale ${i.pontos}.`)
        }
      }
    }
  }
  return avisos
}
