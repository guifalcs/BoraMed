import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { PENDING_PREAPPROVAL_KEY, SubscriptionService } from '../services/subscription.service';

// Rota da própria gestão da assinatura: liberada fora do paywall para que o
// usuário pausado/cancelado alcance "Reativar"/"Assinar novamente" (senão o
// guard o mandaria a /planos e o botão ficaria inalcançável).
const ROTA_MINHA_ASSINATURA = '/dashboard/assinatura';

// Paywall total: o conteúdo só é acessível com assinatura autorizada.
// Admins/super_admins ignoram o paywall. Sem assinatura → redireciona a /planos.
export const subscriptionGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const profileService = inject(ProfileService);
  const subscription = inject(SubscriptionService);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  await auth.initialize();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);

  if (!profileService.profile()) {
    await profileService.loadProfile();
  }

  const papel = profileService.profile()?.papel;
  if (papel === 'admin' || papel === 'super_admin') return true;

  // Minha assinatura é acessível sem acesso ativo (é onde se reativa/reassina).
  // Demais rotas do dashboard seguem no paywall. Compara o PATH exato (ignora
  // query/fragment) p/ não isentar rotas irmãs como /dashboard/assinatura-x.
  const path = state?.url?.split(/[?#]/)[0];
  if (path === ROTA_MINHA_ASSINATURA) return true;

  // Retoma o vínculo de uma assinatura recém-criada caso o retorno do MP tenha
  // caído sem sessão (preapproval_id guardado em sessionStorage antes do login).
  if (isBrowser) {
    const pendente = sessionStorage.getItem(PENDING_PREAPPROVAL_KEY);
    if (pendente) {
      sessionStorage.removeItem(PENDING_PREAPPROVAL_KEY);
      await subscription.vincular(pendente);
    }
  }

  // Consulta autoritativa no servidor (evita estado obsoleto entre usuários).
  // No caminho frio ela costuma já estar em voo (warm-up do authGuard) ou
  // cacheada (positivo) — ver SubscriptionService.temAssinaturaAtivaServidor.
  const ativa = await subscription.temAssinaturaAtivaServidor();
  if (ativa) return true;

  return router.createUrlTree(['/planos']);
};
