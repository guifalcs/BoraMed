import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const profileService = inject(ProfileService);
  const router = inject(Router);
  await auth.initialize();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);

  // Sessão de recovery não pode acessar rotas protegidas — o usuário ainda
  // não fez login de verdade, apenas provou controle do e-mail.
  if (auth.isRecoverySession()) return router.createUrlTree(['/redefinir-senha']);

  if (!profileService.profile()) {
    await profileService.loadProfile();
  }

  if (profileService.profile()?.banido && state.url !== '/conta-suspensa') {
    return router.createUrlTree(['/conta-suspensa']);
  }

  return true;
};
