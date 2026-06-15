import { Routes } from '@angular/router';

export const dashboardRoutes: Routes = [
  {
    path: '',
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
    path: '**',
    loadComponent: () =>
      import('../(errors)/nao-encontrado/nao-encontrado.component').then(
        (m) => m.NaoEncontradoComponent,
      ),
  },
];
