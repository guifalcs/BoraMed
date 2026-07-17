import { Routes } from '@angular/router';
import { lazyTierAvancadoGuard } from '../../core/guards/lazy-route-guards';

export const provasRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./provas-home/provas-home.component').then((m) => m.ProvasHomeComponent),
  },
  {
    path: 'rede-afya/em-breve',
    loadComponent: () =>
      import('./em-breve-page/em-breve-page.component').then((m) => m.EmBrevePageComponent),
  },
  {
    path: 'rede-afya',
    loadComponent: () =>
      import('./provas-afya/provas-afya.component').then((m) => m.ProvasAfyaComponent),
  },
  {
    path: 'montar',
    canActivate: [lazyTierAvancadoGuard],
    loadComponent: () =>
      import('./montar-simulado/montar-simulado.component').then((m) => m.MontarSimuladoComponent),
  },
  {
    path: ':provaId/tentativa/:tentativaId/resultado',
    loadComponent: () =>
      import('./tentativa-resultado/tentativa-resultado.component').then(
        (m) => m.TentativaResultadoComponent,
      ),
  },
  {
    path: ':provaId/tentativa/:tentativaId/revisao',
    loadComponent: () =>
      import('./prova-visualizar/prova-visualizar.component').then((m) => m.ProvaVisualizarComponent),
  },
  {
    path: ':provaId/tentativa/:tentativaId',
    loadComponent: () =>
      import('./tentativa-exec/tentativa-exec.component').then(
        (m) => m.TentativaExecComponent,
      ),
  },
  {
    path: ':provaId/visualizar',
    loadComponent: () =>
      import('./prova-visualizar/prova-visualizar.component').then((m) => m.ProvaVisualizarComponent),
  },
  {
    path: ':provaId',
    loadComponent: () =>
      import('./prova-detalhe/prova-detalhe.component').then((m) => m.ProvaDetalheComponent),
  },
];
