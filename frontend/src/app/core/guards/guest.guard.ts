import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();

  // Sessão de recovery não conta como "logado de verdade" — sem isso, o
  // usuário fica preso num loop: guestGuard manda pro /dashboard, authGuard
  // detecta a sessão de recovery e manda de volta pro /redefinir-senha.
  if (auth.isAuthenticated() && !auth.isRecoverySession()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
