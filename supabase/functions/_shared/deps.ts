import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.108.2';
import type { GradingProvider } from './grading-provider.ts';
import { gradingProviderFromConfig, type IaConfig, loadIaConfig } from './ia-config.ts';

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
   * Config NÃO-SECRETA do agente de IA (tabela `ia_agente`), lida via
   * service_role. `null` = agente inexistente.
   */
  loadIaConfig(slug: string): Promise<IaConfig | null>;
  /**
   * Motor de correção de questões abertas, resolvido a partir da config do DB
   * (provider/modelo/base_url/...) combinada com a chave da API do env. `null`
   * = IA indisponível/desligada → correção vira `sem_ia`.
   */
  gradingProvider(config: IaConfig | null): GradingProvider | null;
}

export function realDeps(): Deps {
  const url = () => Deno.env.get('SUPABASE_URL')!;
  const adminClient = () =>
    createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  return {
    env: (k) => Deno.env.get(k),
    admin: adminClient,
    caller: (authHeader) =>
      createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      }),
    fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    loadIaConfig: (slug) => loadIaConfig(adminClient(), slug),
    gradingProvider: (config) =>
      gradingProviderFromConfig(config, (k) => Deno.env.get(k), (input, init) => fetch(input, init)),
  };
}
