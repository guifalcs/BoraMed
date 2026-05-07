import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./(auth)/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'cadastro',
    loadComponent: () =>
      import('./(auth)/cadastro/cadastro.component').then((m) => m.CadastroComponent),
  },
  {
    path: 'recuperar-senha',
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
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
