import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent,
      ),
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./usuarios/admin-usuarios.component').then(
        (m) => m.AdminUsuariosComponent,
      ),
  },
  {
    path: 'questoes',
    loadComponent: () =>
      import('./questoes/admin-questoes.component').then(
        (m) => m.AdminQuestoesComponent,
      ),
  },
  {
    path: 'provas',
    loadComponent: () =>
      import('./provas/admin-provas.component').then(
        (m) => m.AdminProvasComponent,
      ),
  },
  {
    path: 'temas',
    loadComponent: () =>
      import('./temas/admin-temas.component').then(
        (m) => m.AdminTemasComponent,
      ),
  },
  {
    path: 'disciplinas',
    loadComponent: () =>
      import('./disciplinas/admin-disciplinas.component').then(
        (m) => m.AdminDisciplinasComponent,
      ),
  },
  {
    path: 'importar',
    loadComponent: () =>
      import('./importar/admin-importar.component').then(
        (m) => m.AdminImportarComponent,
      ),
  },
  {
    path: 'avisos',
    loadComponent: () =>
      import('./avisos/admin-avisos.component').then(
        (m) => m.AdminAvisosComponent,
      ),
  },
];
