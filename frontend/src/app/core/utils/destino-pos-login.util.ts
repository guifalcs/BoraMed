/**
 * Destino guardado para depois do cadastro/login.
 *
 * O visitante que chega pelo link de um gabarito precisa criar conta para ver as
 * respostas. O cadastro passa pela confirmação de e-mail, cujo template (no
 * Supabase) sempre manda para /dashboard. Sem isto, a pessoa confirmaria o
 * e-mail e cairia no Início, sem o gabarito que veio buscar. Então a página de
 * convite guarda o destino no navegador, e o shell do dashboard o consome na
 * primeira entrada.
 *
 * Só aceita caminhos internos de gabarito (nada de open redirect) e expira em
 * 24h, para não sequestrar uma entrada qualquer dias depois.
 */
const CHAVE = 'bm-destino-pos-login';
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const PERMITIDO = /^\/dashboard\/gabaritos(\/[a-z0-9-]+)?$/;

export function destinoPermitido(caminho: string | null | undefined): caminho is string {
  return !!caminho && PERMITIDO.test(caminho);
}

export function salvarDestinoPosLogin(caminho: string, agora: number = Date.now()): void {
  if (!destinoPermitido(caminho)) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ caminho, em: agora }));
  } catch {
    /* storage bloqueado: o aluno cai no Início, como antes */
  }
}

/** Lê e apaga. Devolve null se não houver, se expirou ou se não for permitido. */
export function consumirDestinoPosLogin(agora: number = Date.now()): string | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    localStorage.removeItem(CHAVE);
    const { caminho, em } = JSON.parse(bruto) as { caminho?: unknown; em?: unknown };
    if (typeof caminho !== 'string' || typeof em !== 'number') return null;
    if (agora - em > VALIDADE_MS) return null;
    return destinoPermitido(caminho) ? caminho : null;
  } catch {
    return null;
  }
}
