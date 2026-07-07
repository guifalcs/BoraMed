import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.108.2';
import type { GradingProvider } from './grading-provider.ts';
import { openAiCompatProvider } from './grading-openai-compat.ts';
import { fakeProvider } from './grading-fake.ts';

// Dependências injetáveis das edge functions de pagamento. A produção usa
// `realDeps()` (Deno.env, clientes Supabase reais, fetch global). Os testes
// injetam fakes determinísticos, sem rede nem banco.
export interface Deps {
  /** Lê uma variável de ambiente. */
  env(key: string): string | undefined;
  /** Cliente Supabase com service_role (ignora RLS). */
  admin(): SupabaseClient;
  /** Cliente Supabase autenticado como o chamador (identidade do JWT). */
  caller(authHeader: string): SupabaseClient;
  /** fetch (para a API do Mercado Pago). */
  fetch: typeof fetch;
  /** Relógio injetável, para datas determinísticas em teste. */
  now(): Date;
  /** Espera (backoff de retry); no-op nos testes. */
  sleep(ms: number): Promise<void>;
  /**
   * Motor de correção de questões abertas, escolhido por env
   * (AI_GRADING_PROVIDER = 'openai-compat' | 'fake'). `null` = IA
   * indisponível/não configurada → correção vira `sem_ia`.
   */
  gradingProvider(): GradingProvider | null;
}

/** Resolve o provider de correção a partir das envs (exportado p/ testes). */
export function gradingProviderFromEnv(
  env: (key: string) => string | undefined,
  fetchImpl: typeof fetch,
): GradingProvider | null {
  const tipo = env('AI_GRADING_PROVIDER');
  if (tipo === 'fake') return fakeProvider();
  if (tipo === 'openai-compat') {
    const baseUrl = env('AI_GRADING_BASE_URL');
    const modelo = env('AI_GRADING_MODEL');
    const apiKey = env('AI_GRADING_API_KEY');
    if (!baseUrl || !modelo || !apiKey) return null;
    return openAiCompatProvider({ baseUrl, modelo, apiKey, fetch: fetchImpl });
  }
  return null;
}

export function realDeps(): Deps {
  const url = () => Deno.env.get('SUPABASE_URL')!;
  return {
    env: (k) => Deno.env.get(k),
    admin: () =>
      createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    caller: (authHeader) =>
      createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      }),
    fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    gradingProvider: () =>
      gradingProviderFromEnv((k) => Deno.env.get(k), (input, init) => fetch(input, init)),
  };
}
