import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: 'cadastro', renderMode: RenderMode.Prerender },
  { path: 'recuperar-senha', renderMode: RenderMode.Prerender },
  { path: 'auth/callback', renderMode: RenderMode.Client },
  { path: 'redefinir-senha', renderMode: RenderMode.Client },
  { path: 'sem-permissao', renderMode: RenderMode.Prerender },
  { path: 'erro', renderMode: RenderMode.Prerender },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'dashboard/**', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Prerender },
];
