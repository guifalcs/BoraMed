import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./(auth)/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'cadastro',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./(auth)/cadastro/cadastro.component').then((m) => m.CadastroComponent),
  },
  {
    path: 'recuperar-senha',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./(auth)/recuperar-senha/recuperar-senha.component').then(
        (m) => m.RecuperarSenhaComponent,
      ),
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./(auth)/redefinir-senha/redefinir-senha.component').then(
        (m) => m.RedefinirSenhaComponent,
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./(dashboard)/dashboard.component').then((m) => m.DashboardComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./(dashboard)/inicio/inicio.component').then((m) => m.InicioComponent),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./(dashboard)/perfil/perfil.component').then((m) => m.PerfilComponent),
      },
      {
        path: 'suporte',
        loadComponent: () =>
          import('./(dashboard)/suporte/suporte.component').then((m) => m.SuporteComponent),
      },
      {
        path: 'simulados',
        loadChildren: () =>
          import('./(dashboard)/provas/provas.routes').then((m) => m.provasRoutes),
      },
      { path: '**', loadComponent: () => import('./(errors)/nao-encontrado/nao-encontrado.component').then(m => m.NaoEncontradoComponent) },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'sem-permissao', loadComponent: () => import('./(errors)/sem-permissao/sem-permissao.component').then(m => m.SemPermissaoComponent) },
  { path: 'erro', loadComponent: () => import('./(errors)/erro-servidor/erro-servidor.component').then(m => m.ErroServidorComponent) },
  { path: '**', loadComponent: () => import('./(errors)/nao-encontrado/nao-encontrado.component').then(m => m.NaoEncontradoComponent) },
];
