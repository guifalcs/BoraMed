// Redirecionador da back_url do Mercado Pago para o app.
// O MP exige uma back_url HTTPS pública; durante o desenvolvimento o app roda em
// http://localhost, que o MP não aceita. Esta função (HTTPS, pública) recebe o
// retorno do MP e redireciona (302) o navegador do usuário para a tela
// /assinatura/retorno do app, repassando os query params conhecidos
// (preapproval_id, etc.).
// Em produção, o back_url do plano aponta direto para o domínio do app e esta
// função não é necessária.

// Whitelist dos params que o MP envia no retorno e que o app consome
// (ver assinatura-retorno.component.ts). Nunca repassar a query string
// inteira: evita refletir parâmetros arbitrários (ex.: open-redirect/XSS via
// query) para o destino.
const PARAMS_PERMITIDOS = [
  'preapproval_id',
  'payment_id',
  'collection_id',
  'status',
  'collection_status',
  'external_reference',
  'preference_id',
];

Deno.serve((req) => {
  const url = new URL(req.url);
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  // Log mínimo (sem repassar toda a query, que pode conter dados sensíveis).
  console.log('mp-retorno status:', url.searchParams.get('status') ?? url.searchParams.get('collection_status'));

  const dest = new URL(`${appUrl}/assinatura/retorno`);
  for (const k of PARAMS_PERMITIDOS) {
    const v = url.searchParams.get(k);
    if (v !== null) dest.searchParams.set(k, v);
  }

  return new Response(null, { status: 302, headers: { Location: dest.toString() } });
});
