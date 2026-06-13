import { Routes } from '@angular/router';
import {
  lazyAdminGuard,
  lazyAuthGuard,
  lazyGuestGuard,
} from './core/guards/lazy-route-guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./(marketing)/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    canActivate: [lazyGuestGuard],
    loadComponent: () =>
      import('./(auth)/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'cadastro',
    canActivate: [lazyGuestGuard],
    loadComponent: () =>
      import('./(auth)/cadastro/cadastro.component').then((m) => m.CadastroComponent),
  },
  {
    path: 'recuperar-senha',
    canActivate: [lazyGuestGuard],
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
    canActivate: [lazyAuthGuard],
    loadComponent: () =>
      import('./(dashboard)/dashboard.component').then((m) => m.DashboardComponent),
    loadChildren: () =>
      import('./(dashboard)/dashboard.routes').then((m) => m.dashboardRoutes),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./(auth)/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'imprimir/simulado/montado',
    canActivate: [lazyAuthGuard],
    data: { modo: 'efemero' },
    loadComponent: () =>
      import('./(impressao)/simulado-impressao.component').then((m) => m.SimuladoImpressaoComponent),
  },
  {
    path: 'imprimir/simulado/:provaId',
    canActivate: [lazyAuthGuard],
    loadComponent: () =>
      import('./(impressao)/simulado-impressao.component').then((m) => m.SimuladoImpressaoComponent),
  },
  {
    path: 'admin',
    canActivate: [lazyAdminGuard],
    loadComponent: () =>
      import('./(admin)/admin.component').then((m) => m.AdminComponent),
    loadChildren: () =>
      import('./(admin)/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'politica-de-privacidade',
    loadComponent: () =>
      import('./(legal)/politica-de-privacidade/politica-de-privacidade.component').then(
        (m) => m.PoliticaDePrivacidadeComponent,
      ),
  },
  {
    path: 'termos-de-uso',
    loadComponent: () =>
      import('./(legal)/termos-de-uso/termos-de-uso.component').then((m) => m.TermosDeUsoComponent),
  },
  { path: 'sem-permissao', loadComponent: () => import('./(errors)/sem-permissao/sem-permissao.component').then(m => m.SemPermissaoComponent) },
  { path: 'erro', loadComponent: () => import('./(errors)/erro-servidor/erro-servidor.component').then(m => m.ErroServidorComponent) },
  { path: '**', loadComponent: () => import('./(errors)/nao-encontrado/nao-encontrado.component').then(m => m.NaoEncontradoComponent) },
];
