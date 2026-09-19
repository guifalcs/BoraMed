import { Routes } from '@angular/router';

export const cadernoErrosRoutes: Routes = [
  {
    path: '',
    title: 'Caderno de Erros',
    loadComponent: () =>
      import('./caderno-erros-home/caderno-erros-home.component').then(
        (m) => m.CadernoErrosHomeComponent,
      ),
  },
  {
    path: 'refazer/:questaoId',
    title: 'Refazer questão',
    loadComponent: () =>
      import('./refazer-questao/refazer-questao.component').then(
        (m) => m.RefazerQuestaoComponent,
      ),
  },
];
