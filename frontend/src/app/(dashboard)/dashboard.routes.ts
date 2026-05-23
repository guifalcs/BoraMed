import { Routes } from '@angular/router';
import { inicioResolver } from '../core/resolvers/inicio.resolver';
import { historicoResolver } from '../core/resolvers/historico.resolver';

export const dashboardRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./inicio/inicio.component').then((m) => m.InicioComponent),
    resolve: { inicioData: inicioResolver },
  },
  {
    path: 'perfil',
    loadComponent: () =>
      import('./perfil/perfil.component').then((m) => m.PerfilComponent),
  },
  { path: 'perfil/competitivo', pathMatch: 'full', redirectTo: 'perfil' },
  {
    path: 'suporte',
    loadComponent: () =>
      import('./suporte/suporte.component').then((m) => m.SuporteComponent),
  },
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
    resolve: { historicoData: historicoResolver },
  },
  {
    path: '**',
    loadComponent: () =>
      import('../(errors)/nao-encontrado/nao-encontrado.component').then(
        (m) => m.NaoEncontradoComponent,
      ),
  },
];
