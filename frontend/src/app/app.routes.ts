import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { adminGuard } from './core/guards/admin.guard';
import { inicioResolver } from './core/resolvers/inicio.resolver';
import { historicoResolver } from './core/resolvers/historico.resolver';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./(marketing)/landing/landing.component').then((m) => m.LandingComponent),
  },
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
        resolve: { inicioData: inicioResolver },
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./(dashboard)/perfil/perfil.component').then((m) => m.PerfilComponent),
      },
      { path: 'perfil/competitivo', pathMatch: 'full', redirectTo: 'perfil' },
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
      {
        path: 'competitivo',
        loadComponent: () =>
          import('./(dashboard)/competir/competir-hub.component').then(
            (m) => m.CompetirHubComponent,
          ),
      },
      { path: 'competir', pathMatch: 'full', redirectTo: 'competitivo' },
      {
        path: 'historico',
        loadComponent: () =>
          import('./(dashboard)/historico/historico.component').then((m) => m.HistoricoComponent),
        resolve: { historicoData: historicoResolver },
      },
      { path: '**', loadComponent: () => import('./(errors)/nao-encontrado/nao-encontrado.component').then(m => m.NaoEncontradoComponent) },
    ],
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./(auth)/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./(admin)/admin.component').then((m) => m.AdminComponent),
    loadChildren: () =>
      import('./(admin)/admin.routes').then((m) => m.adminRoutes),
  },
  { path: 'sem-permissao', loadComponent: () => import('./(errors)/sem-permissao/sem-permissao.component').then(m => m.SemPermissaoComponent) },
  { path: 'erro', loadComponent: () => import('./(errors)/erro-servidor/erro-servidor.component').then(m => m.ErroServidorComponent) },
  { path: '**', loadComponent: () => import('./(errors)/nao-encontrado/nao-encontrado.component').then(m => m.NaoEncontradoComponent) },
];
