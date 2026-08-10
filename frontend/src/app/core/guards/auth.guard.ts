import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { PENDING_PREAPPROVAL_KEY, SubscriptionService } from '../services/subscription.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const profileService = inject(ProfileService);
  const subscription = inject(SubscriptionService);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  await auth.initialize();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);

  // Sessão de recovery não pode acessar rotas protegidas — o usuário ainda
  // não fez login de verdade, apenas provou controle do e-mail.
  if (auth.isRecoverySession()) return router.createUrlTree(['/redefinir-senha']);

  if (!profileService.profile()) {
    // Aquece o status de acesso em paralelo com o profile: o dashboard e os
    // guards de nível que rodam em seguida reaproveitam a requisição em voo
    // (dedup no serviço) em vez de só ir à rede depois do profile resolver.
    void subscription.statusAcessoServidor();
    await profileService.loadProfile();
  }

  if (profileService.profile()?.banido && state.url !== '/conta-suspensa') {
    return router.createUrlTree(['/conta-suspensa']);
  }

  // Retoma o vínculo de uma assinatura recém-criada caso o retorno do Mercado
  // Pago tenha caído sem sessão (preapproval_id guardado em sessionStorage
  // antes do login). Vivia no subscriptionGuard, que protegia todo o
  // /dashboard; com o plano gratuito esse guard saiu dali, e a retomada
  // precisava continuar acontecendo em qualquer rota autenticada de destino.
  // Fluxo LEGADO (Checkout Pro), com remoção prevista na F8.
  if (isBrowser) {
    const pendente = sessionStorage.getItem(PENDING_PREAPPROVAL_KEY);
    if (pendente) {
      sessionStorage.removeItem(PENDING_PREAPPROVAL_KEY);
      await subscription.vincular(pendente);
    }
  }

  return true;
};
