import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Decide o destino da rota raiz sem montar a landing para quem já tem sessão.
 * A sessão é lida do storage/cookie local por AuthService.initialize(), sem
 * round-trip extra ao Supabase.
 */
export const rootRedirectGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.initialize();

  if (auth.isRecoverySession()) {
    return router.createUrlTree(['/redefinir-senha']);
  }

  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
