import { RenderMode, ServerRoute } from '@angular/ssr';

import { getGuiaSlugs } from './(marketing)/guias/guias.data';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'guias', renderMode: RenderMode.Prerender },
  {
    path: 'guias/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => getGuiaSlugs().map((slug) => ({ slug })),
  },
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: 'cadastro', renderMode: RenderMode.Prerender },
  { path: 'recuperar-senha', renderMode: RenderMode.Prerender },
  { path: 'auth/callback', renderMode: RenderMode.Client },
  { path: 'redefinir-senha', renderMode: RenderMode.Client },
  // Depende do ?token= da query string e do Supabase no browser.
  { path: 'descadastrar', renderMode: RenderMode.Client },
  { path: 'sem-permissao', renderMode: RenderMode.Prerender },
  { path: 'erro', renderMode: RenderMode.Prerender },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  // Depende da sessão (authGuard) e dos planos vindos do Supabase no browser.
  // Sem esta entrada caía no `**` = Prerender: o HTML era gerado em build, SEM
  // usuário, então o carregamento frio (link direto, F5, e-mail) passava pelo
  // /login e terminava no /dashboard — nunca em /planos. Passava batido porque
  // o paywall do /dashboard devolvia o não-assinante para /planos; com o plano
  // gratuito esse desvio deixou de existir e o destino de upsell quebrou.
  { path: 'planos', renderMode: RenderMode.Client },
  // Checkout embutido: 100% client-side (Bricks do MP + sessão do usuário).
  { path: 'checkout/status/:intencaoId', renderMode: RenderMode.Client },
  { path: 'checkout/:plano', renderMode: RenderMode.Client },
  { path: 'imprimir/simulado/montado', renderMode: RenderMode.Client },
  { path: 'imprimir/simulado/:provaId', renderMode: RenderMode.Client },
  { path: 'dashboard/**', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Prerender },
];
