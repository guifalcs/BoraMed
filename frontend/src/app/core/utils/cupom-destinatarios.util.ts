/**
 * Utilitários da lista de destinatários de cupom restrito (admin).
 * O servidor revalida tudo (`admin_salvar_cupom`); aqui é só conveniência de UI.
 */

// Mesma regra do banco: algo@dominio.tld, sem espaços.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface EmailsExtraidos {
  /** Normalizados (minúsculos), sem repetição, na ordem em que apareceram. */
  validos: string[];
  /** Trechos que não parecem e-mail (para avisar o admin). */
  invalidos: string[];
}

/** Normaliza um e-mail como o banco faz: trim + minúsculas. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Extrai e-mails de um texto colado — separados por vírgula, ponto e vírgula,
 * espaço ou quebra de linha (ex.: coluna copiada de uma planilha).
 */
export function extrairEmails(texto: string): EmailsExtraidos {
  const validos: string[] = [];
  const invalidos: string[] = [];
  const vistos = new Set<string>();

  for (const bruto of texto.split(/[\s,;]+/)) {
    const email = normalizarEmail(bruto);
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      invalidos.push(bruto.trim());
      continue;
    }
    if (vistos.has(email)) continue;
    vistos.add(email);
    validos.push(email);
  }
  return { validos, invalidos };
}
