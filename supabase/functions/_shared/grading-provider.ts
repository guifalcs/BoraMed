// Contrato do motor de correção de questões abertas (D8 do plano).
// A edge function `corrigir-resposta-aberta` só conhece esta interface;
// o provider concreto (OpenRouter/OpenAI/Gemini via API OpenAI-compatible,
// ou o fake determinístico) é escolhido por env em `deps.ts`.

export interface GradingInput {
  enunciado: string;
  enunciado_apoio: string | null;
  resposta_modelo: string;
  pontos_chave: string[];
  criterios_correcao: string | null;
  resposta_aluno: string;
}

export interface GradingResult {
  /** Nota 0–100 (já clampada pelo provider). */
  pontos: number;
  /** Feedback pedagógico em PT-BR para o aluno. */
  feedback: string;
  pontos_atendidos: string[];
  pontos_faltantes: string[];
  /** Erros conceituais/perigosos apontados na resposta. */
  erros: string[];
  provider: string;
  modelo: string;
  tokens_prompt: number | null;
  tokens_resposta: number | null;
}

export interface GradingProvider {
  nome: string;
  corrigir(input: GradingInput): Promise<GradingResult>;
}

/** Falha de correção; `retryable` decide se o handler tenta de novo. */
export class GradingError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'GradingError';
  }
}

export function clampPontos(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) {
    throw new GradingError('pontos não numérico na resposta do modelo', true);
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function toStringArray(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === 'string');
}
