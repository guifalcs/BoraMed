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
  { path: 'sem-permissao', renderMode: RenderMode.Prerender },
  { path: 'erro', renderMode: RenderMode.Prerender },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'imprimir/simulado/montado', renderMode: RenderMode.Client },
  { path: 'imprimir/simulado/:provaId', renderMode: RenderMode.Client },
  { path: 'dashboard/**', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Prerender },
];
