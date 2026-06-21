import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { PENDING_PREAPPROVAL_KEY, SubscriptionService } from '../services/subscription.service';

// Paywall total: o conteúdo só é acessível com assinatura autorizada.
// Admins/super_admins ignoram o paywall. Sem assinatura → redireciona a /planos.
export const subscriptionGuard: CanActivateFn = async () => {
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
  const ativa = await subscription.temAssinaturaAtivaServidor();
  if (ativa) return true;

  return router.createUrlTree(['/planos']);
};
