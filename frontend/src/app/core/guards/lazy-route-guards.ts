import { EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import type { CanActivateFn, GuardResult } from '@angular/router';

export const lazyAuthGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./auth.guard').then((m) =>
    runInInjectionContext(injector, () => m.authGuard(route, state)),
  ) as Promise<GuardResult>;
};

export const lazyGuestGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./guest.guard').then((m) =>
    runInInjectionContext(injector, () => m.guestGuard(route, state)),
  ) as Promise<GuardResult>;
};

export const lazyAdminGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./admin.guard').then((m) =>
    runInInjectionContext(injector, () => m.adminGuard(route, state)),
  ) as Promise<GuardResult>;
};
