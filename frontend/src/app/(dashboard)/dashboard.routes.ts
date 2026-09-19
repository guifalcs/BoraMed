import { Routes } from '@angular/router';
import { lazyNivelPagoGuard, lazyTierAvancadoGuard } from '../core/guards/lazy-route-guards';

export const dashboardRoutes: Routes = [
  {
    path: '',
    title: 'Início',
    data: { preload: true },
    loadComponent: () =>
      import('./inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'perfil',
    title: 'Meu perfil',
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
    title: 'Competitivo',
    loadComponent: () =>
      import('./competir/competir-hub.component').then(
        (m) => m.CompetirHubComponent,
      ),
  },
  { path: 'competir', pathMatch: 'full', redirectTo: 'competitivo' },
  {
    path: 'historico',
    title: 'Histórico',
    loadComponent: () =>
      import('./historico/historico.component').then((m) => m.HistoricoComponent),
  },
  {
    path: 'caderno-de-erros',
    canActivate: [lazyNivelPagoGuard],
    canActivateChild: [lazyNivelPagoGuard],
    loadChildren: () =>
      import('./caderno-erros/caderno-erros.routes').then((m) => m.cadernoErrosRoutes),
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
    title: 'Minha assinatura',
    loadComponent: () =>
      import('./assinatura/minha-assinatura.component').then((m) => m.MinhaAssinaturaComponent),
  },
  {
    path: '**',
    title: 'Página não encontrada',
    loadComponent: () =>
      import('../(errors)/nao-encontrado/nao-encontrado.component').then(
        (m) => m.NaoEncontradoComponent,
      ),
  },
];
