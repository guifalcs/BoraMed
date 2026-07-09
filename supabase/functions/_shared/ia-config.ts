// Comportamento NÃO-SECRETO dos agentes de IA (Aurora), persistido em
// `public.ia_agente` e gerenciado no painel /admin/ia: liga/desliga, limites,
// temperatura e o prompt (persona/tom/tamanho/regras).
//
// MODELO E CONEXÃO ficam FORA daqui (decisão do dono): provider, base_url,
// modelo, ordem de fallback e a chave da API vêm de env/secrets (AI_GRADING_*),
// controlados pelo dev + painel do OpenRouter.
//
// Segurança: os campos de prompt aqui (persona/tom/tamanho/regras) são SÓ
// conteúdo adicional em slots fixos do system prompt. As defesas anti-injection
// e o contrato JSON são imutáveis em `grading-openai-compat.ts` — a config não
// consegue removê-los.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.108.2';
import type { GradingProvider } from './grading-provider.ts';
import { openAiCompatProvider, type PromptConfig } from './grading-openai-compat.ts';
import { fakeProvider } from './grading-fake.ts';

export interface IaConfig {
  slug: string;
  nome: string;
  ativo: boolean;
  temperatura: number;
  limite_diario: number;
  max_resposta_chars: number;
  persona: string | null;
  tom: string | null;
  tamanho_feedback: string | null;
  regras_correcao: string | null;
  regras_extras: string | null;
}

/** Lê a config do agente por slug (via service_role; ignora RLS). */
export async function loadIaConfig(
  admin: SupabaseClient,
  slug: string,
): Promise<IaConfig | null> {
  const { data } = await admin
    .from('ia_agente')
    .select(
      'slug, nome, ativo, temperatura, limite_diario, max_resposta_chars, ' +
        'persona, tom, tamanho_feedback, regras_correcao, regras_extras',
    )
    .eq('slug', slug)
    .maybeSingle();
  return (data as IaConfig | null) ?? null;
}

function promptConfigFrom(config: IaConfig): PromptConfig {
  return {
    persona: config.persona,
    tom: config.tom,
    tamanho_feedback: config.tamanho_feedback,
    regras_correcao: config.regras_correcao,
    regras_extras: config.regras_extras,
  };
}

/**
 * Resolve o provider de correção. A CONEXÃO vem do env (dev): AI_GRADING_PROVIDER
 * ('openai-compat' | 'fake'), AI_GRADING_BASE_URL, AI_GRADING_MODEL,
 * AI_GRADING_API_KEY, AI_GRADING_ROUTER_ORDER. A config do DB só decide o
 * liga/desliga e injeta temperatura + prompt.
 * Precedência:
 *   1. config ausente ou !ativo → null (→ sem_ia). O on/off do painel é soberano.
 *   2. env AI_GRADING_PROVIDER === 'fake' → fake (escape hatch de teste/local).
 *   3. 'openai-compat' → exige base_url + modelo + chave (env). Faltando → null.
 */
export function gradingProviderFromConfig(
  config: IaConfig | null,
  env: (key: string) => string | undefined,
  fetchImpl: typeof fetch,
): GradingProvider | null {
  if (!config || !config.ativo) return null;

  const tipo = env('AI_GRADING_PROVIDER');
  if (tipo === 'fake') return fakeProvider();
  if (tipo === 'openai-compat') {
    const baseUrl = env('AI_GRADING_BASE_URL');
    const modelo = env('AI_GRADING_MODEL');
    const apiKey = env('AI_GRADING_API_KEY');
    if (!baseUrl || !modelo || !apiKey) return null;
    const providerOrder = (env('AI_GRADING_ROUTER_ORDER') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return openAiCompatProvider({
      baseUrl,
      modelo,
      apiKey,
      fetch: fetchImpl,
      providerOrder,
      temperatura: config.temperatura,
      prompt: promptConfigFrom(config),
    });
  }
  return null;
}
