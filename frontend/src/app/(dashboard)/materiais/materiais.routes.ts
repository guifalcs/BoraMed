import { Routes } from '@angular/router';

export const materiaisRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./materiais-home/materiais-home.component').then(
        (m) => m.MateriaisHomeComponent,
      ),
  },
  {
    path: ':categoriaSlug',
    loadComponent: () =>
      import('./material-categoria/material-categoria.component').then(
        (m) => m.MaterialCategoriaComponent,
      ),
  },
];
