import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Páginas públicas servidas pela função SSR (RenderMode.Server) para que o
  // middleware de CSP/nonce em server.ts aplique o cabeçalho a cada requisição.
  // Antes eram Prerender (estáticas na CDN), o que as deixava sem CSP.
  { path: '', renderMode: RenderMode.Server },
  { path: 'guias', renderMode: RenderMode.Server },
  { path: 'guias/:slug', renderMode: RenderMode.Server },
  { path: 'login', renderMode: RenderMode.Server },
  { path: 'cadastro', renderMode: RenderMode.Server },
  { path: 'recuperar-senha', renderMode: RenderMode.Server },
  { path: 'auth/callback', renderMode: RenderMode.Client },
  { path: 'redefinir-senha', renderMode: RenderMode.Client },
  { path: 'sem-permissao', renderMode: RenderMode.Server },
  { path: 'erro', renderMode: RenderMode.Server },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'imprimir/simulado/montado', renderMode: RenderMode.Client },
  { path: 'imprimir/simulado/:provaId', renderMode: RenderMode.Client },
  { path: 'dashboard/**', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Server },
];
