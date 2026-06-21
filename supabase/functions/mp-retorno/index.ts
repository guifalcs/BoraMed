// Redirecionador da back_url do Mercado Pago para o app.
// O MP exige uma back_url HTTPS pública; durante o desenvolvimento o app roda em
// http://localhost, que o MP não aceita. Esta função (HTTPS, pública) recebe o
// retorno do MP e redireciona (302) o navegador do usuário para a tela
// /assinatura/retorno do app, repassando os query params (preapproval_id, etc.).
// Em produção, o back_url do plano aponta direto para o domínio do app e esta
// função não é necessária.
Deno.serve((req) => {
  const url = new URL(req.url);
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  // Log para inspecionar exatamente o que o Mercado Pago envia no retorno.
  console.log('mp-retorno query:', url.search);

  const dest = new URL(`${appUrl}/assinatura/retorno`);
  for (const [k, v] of url.searchParams) dest.searchParams.set(k, v);

  return new Response(null, { status: 302, headers: { Location: dest.toString() } });
});
