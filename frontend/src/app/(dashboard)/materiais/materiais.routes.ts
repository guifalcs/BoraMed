import { Routes } from '@angular/router';

export const materiaisRoutes: Routes = [
  {
    path: '',
    title: 'Materiais',
    loadComponent: () =>
      import('./materiais-home/materiais-home.component').then(
        (m) => m.MateriaisHomeComponent,
      ),
  },
  {
    path: ':categoriaSlug',
    title: 'Materiais',
    loadComponent: () =>
      import('./material-categoria/material-categoria.component').then(
        (m) => m.MaterialCategoriaComponent,
      ),
  },
];
