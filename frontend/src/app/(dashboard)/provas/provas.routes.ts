import { Routes } from '@angular/router';
import { lazyMontarSimuladoGuard } from '../../core/guards/lazy-route-guards';

export const provasRoutes: Routes = [
  {
    path: '',
    title: 'Simulados',
    loadComponent: () =>
      import('./provas-home/provas-home.component').then((m) => m.ProvasHomeComponent),
  },
  {
    path: 'rede-afya/em-breve',
    title: 'Em breve',
    loadComponent: () =>
      import('./em-breve-page/em-breve-page.component').then((m) => m.EmBrevePageComponent),
  },
  {
    path: 'rede-afya',
    title: 'Treinos nacionais',
    loadComponent: () =>
      import('./provas-afya/provas-afya.component').then((m) => m.ProvasAfyaComponent),
  },
  {
    path: 'montar',
    title: 'Montar simulado',
    // Só o Essencial é barrado aqui — o gratuito monta gastando o crédito
    // único. Ver montar-simulado.guard.ts.
    canActivate: [lazyMontarSimuladoGuard],
    loadComponent: () =>
      import('./montar-simulado/montar-simulado.component').then((m) => m.MontarSimuladoComponent),
  },
  {
    path: ':provaId/tentativa/:tentativaId/resultado',
    title: 'Resultado do simulado',
    loadComponent: () =>
      import('./tentativa-resultado/tentativa-resultado.component').then(
        (m) => m.TentativaResultadoComponent,
      ),
  },
  {
    path: ':provaId/tentativa/:tentativaId/revisao',
    title: 'Revisão do simulado',
    loadComponent: () =>
      import('./prova-visualizar/prova-visualizar.component').then((m) => m.ProvaVisualizarComponent),
  },
  {
    path: ':provaId/tentativa/:tentativaId',
    title: 'Simulado em andamento',
    data: { preload: true },
    loadComponent: () =>
      import('./tentativa-exec/tentativa-exec.component').then(
        (m) => m.TentativaExecComponent,
      ),
  },
  {
    path: ':provaId/visualizar',
    title: 'Visualizar simulado',
    loadComponent: () =>
      import('./prova-visualizar/prova-visualizar.component').then((m) => m.ProvaVisualizarComponent),
  },
  {
    path: ':provaId',
    title: 'Detalhes do simulado',
    loadComponent: () =>
      import('./prova-detalhe/prova-detalhe.component').then((m) => m.ProvaDetalheComponent),
  },
];
