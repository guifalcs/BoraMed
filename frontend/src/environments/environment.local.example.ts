// Ambiente LOCAL de testes — copie para `environment.local.ts` (gitignored).
//   cp environment.local.example.ts environment.local.ts
//
// O build de desenvolvimento (`ng serve` / `ng build --configuration development`)
// substitui `environment.ts` por `environment.local.ts` (ver angular.json).
//
// Dois cenários de teste de pagamento:
//   A) Stack 100% local (`supabase start`): mantenha os valores locais abaixo.
//      Webhooks do Mercado Pago NÃO chegam em localhost — use o túnel (ngrok) ou
//      o simulador `scripts/mp-webhook-sim.ts` (ver docs/ambiente-testes-pagamento.md).
//   B) Branch de preview do Supabase: troque supabaseUrl/supabaseAnonKey pelos
//      valores do branch (Dashboard → Branch → API). Aí os webhooks reais do MP
//      test chegam direto, sem túnel.
export const environment = {
  production: false,
  // A) Stack local padrão do Supabase CLI:
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  // Sentry desligado em testes locais (deixe vazio para não poluir o projeto):
  sentryDsn: '',
  // Public key de TESTE do Mercado Pago (começa com TEST-...). Não é segredo,
  // mas use a do seu vendedor de teste:
  mercadoPagoPublicKey: 'TEST-aef365d1-0442-4174-8e02-3da444226cab',
};
