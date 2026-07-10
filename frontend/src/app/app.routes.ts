import { Routes } from '@angular/router';
import {
  lazyAdminGuard,
  lazyAuthGuard,
  lazyBannedAccountGuard,
  lazyGuestGuard,
  lazySubscriptionGuard,
} from './core/guards/lazy-route-guards';
import { oauthRedirectGuard } from './core/guards/oauth-redirect.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [oauthRedirectGuard],
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
    path: 'conta-suspensa',
    canActivate: [lazyBannedAccountGuard],
    loadComponent: () =>
      import('./(auth)/conta-suspensa/conta-suspensa.component').then(
        (m) => m.ContaSuspensaComponent,
      ),
  },
  {
    path: 'dashboard',
    canActivate: [lazyAuthGuard, lazySubscriptionGuard],
    // canActivateChild re-aplica o paywall a CADA navegação entre rotas-filhas.
    // Sem ele, um usuário sem acesso que entrasse pela rota isenta
    // (/dashboard/assinatura) circularia livre pelo dashboard, pois o canActivate
    // do pai só roda na 1ª ativação. O guard isenta apenas /dashboard/assinatura.
    canActivateChild: [lazySubscriptionGuard],
    loadComponent: () =>
      import('./(dashboard)/dashboard.component').then((m) => m.DashboardComponent),
    loadChildren: () =>
      import('./(dashboard)/dashboard.routes').then((m) => m.dashboardRoutes),
  },
  {
    path: 'planos',
    canActivate: [lazyAuthGuard],
    loadComponent: () =>
      import('./(assinatura)/planos/planos.component').then((m) => m.PlanosComponent),
  },
  {
    path: 'checkout/status/:intencaoId',
    canActivate: [lazyAuthGuard],
    loadComponent: () =>
      import('./(assinatura)/checkout/pagamento-status.component').then(
        (m) => m.PagamentoStatusComponent,
      ),
  },
  {
    path: 'checkout/:plano',
    canActivate: [lazyAuthGuard],
    loadComponent: () =>
      import('./(assinatura)/checkout/checkout.component').then((m) => m.CheckoutComponent),
  },
  {
    // Rota LEGADA (redirect do Checkout Pro): permanece durante a janela de
    // observação para checkouts em voo. Remoção prevista na F8.
    path: 'assinatura/retorno',
    loadComponent: () =>
      import('./(assinatura)/retorno/assinatura-retorno.component').then(
        (m) => m.AssinaturaRetornoComponent,
      ),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./(auth)/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'imprimir/simulado/montado',
    canActivate: [lazyAuthGuard, lazySubscriptionGuard],
    data: { modo: 'efemero' },
    loadComponent: () =>
      import('./(impressao)/simulado-impressao.component').then((m) => m.SimuladoImpressaoComponent),
  },
  {
    path: 'imprimir/simulado/:provaId',
    canActivate: [lazyAuthGuard, lazySubscriptionGuard],
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
    path: 'guias',
    loadComponent: () =>
      import('./(marketing)/guias/guias-list.component').then((m) => m.GuiasListComponent),
  },
  {
    path: 'guias/:slug',
    loadComponent: () =>
      import('./(marketing)/guias/guia-detail.component').then((m) => m.GuiaDetailComponent),
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
