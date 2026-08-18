import { Routes } from '@angular/router';
import { lazyTierAvancadoGuard } from '../core/guards/lazy-route-guards';

export const dashboardRoutes: Routes = [
  {
    path: '',
    data: { preload: true },
    loadComponent: () =>
      import('./inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'perfil',
    loadComponent: () =>
      import('./perfil/perfil.component').then((m) => m.PerfilComponent),
  },
  { path: 'perfil/competitivo', pathMatch: 'full', redirectTo: 'perfil' },
  {
    path: 'simulados',
    data: { preload: true },
    loadChildren: () =>
      import('./provas/provas.routes').then((m) => m.provasRoutes),
  },
  {
    path: 'competitivo',
    loadComponent: () =>
      import('./competir/competir-hub.component').then(
        (m) => m.CompetirHubComponent,
      ),
  },
  { path: 'competir', pathMatch: 'full', redirectTo: 'competitivo' },
  {
    path: 'historico',
    loadComponent: () =>
      import('./historico/historico.component').then((m) => m.HistoricoComponent),
  },
  {
    path: 'materiais',
    canActivate: [lazyTierAvancadoGuard],
    canActivateChild: [lazyTierAvancadoGuard],
    loadChildren: () =>
      import('./materiais/materiais.routes').then((m) => m.materiaisRoutes),
  },
  {
    path: 'flashcards',
    canActivate: [lazyTierAvancadoGuard],
    canActivateChild: [lazyTierAvancadoGuard],
    loadChildren: () =>
      import('./flashcards/flashcards.routes').then((m) => m.flashcardsRoutes),
  },
  {
    path: 'assinatura',
    loadComponent: () =>
      import('./assinatura/minha-assinatura.component').then((m) => m.MinhaAssinaturaComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('../(errors)/nao-encontrado/nao-encontrado.component').then(
        (m) => m.NaoEncontradoComponent,
      ),
  },
];
