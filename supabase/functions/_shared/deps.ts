import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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
  };
}
