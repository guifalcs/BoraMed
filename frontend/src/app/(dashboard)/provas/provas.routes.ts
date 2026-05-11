import { Routes } from '@angular/router';

export const provasRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./provas-home/provas-home.component').then((m) => m.ProvasHomeComponent),
  },
  {
    path: 'afya/em-breve',
    loadComponent: () =>
      import('./em-breve-page/em-breve-page.component').then((m) => m.EmBrevePageComponent),
  },
  {
    path: 'afya/nacional/lista',
    loadComponent: () =>
      import('./provas-nacional-lista/provas-nacional-lista.component').then(
        (m) => m.ProvasNacionalListaComponent,
      ),
  },
  {
    path: 'afya/nacional',
    loadComponent: () =>
      import('./provas-nacional/provas-nacional.component').then(
        (m) => m.ProvasNacionalComponent,
      ),
  },
  {
    path: 'afya',
    loadComponent: () =>
      import('./provas-afya/provas-afya.component').then((m) => m.ProvasAfyaComponent),
  },
  {
    path: ':provaId/tentativa/:tentativaId/resultado',
    loadComponent: () =>
      import('./tentativa-resultado/tentativa-resultado.component').then(
        (m) => m.TentativaResultadoComponent,
      ),
  },
  {
    path: ':provaId/tentativa/:tentativaId',
    loadComponent: () =>
      import('./tentativa-exec/tentativa-exec.component').then(
        (m) => m.TentativaExecComponent,
      ),
  },
  {
    path: ':provaId',
    loadComponent: () =>
      import('./prova-detalhe/prova-detalhe.component').then((m) => m.ProvaDetalheComponent),
  },
];
