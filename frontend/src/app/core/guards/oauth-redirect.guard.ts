import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Se o provedor de OAuth (Google) voltar para a raiz (Site URL) com `?code=`
// em vez de ir direto ao /auth/callback, redireciona ANTES de a landing
// renderizar — sem flash da landing e sem página intermediária visível.
export const oauthRedirectGuard: CanActivateFn = (route) => {
  const qp = route.queryParams;
  if (qp['code'] || qp['error']) {
    return inject(Router).createUrlTree(['/auth/callback'], { queryParams: qp });
  }
  return true;
};
