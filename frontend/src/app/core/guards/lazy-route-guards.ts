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

export const lazyRootRedirectGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./root-redirect.guard').then((m) =>
    runInInjectionContext(injector, () => m.rootRedirectGuard(route, state)),
  ) as Promise<GuardResult>;
};

export const lazyAdminGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./admin.guard').then((m) =>
    runInInjectionContext(injector, () => m.adminGuard(route, state)),
  ) as Promise<GuardResult>;
};

export const lazyBannedAccountGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./banned-account.guard').then((m) =>
    runInInjectionContext(injector, () => m.bannedAccountGuard(route, state)),
  ) as Promise<GuardResult>;
};

export const lazySubscriptionGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./subscription.guard').then((m) =>
    runInInjectionContext(injector, () => m.subscriptionGuard(route, state)),
  ) as Promise<GuardResult>;
};

export const lazyTierAvancadoGuard: CanActivateFn = (route, state) => {
  const injector = inject(EnvironmentInjector);
  return import('./tier.guard').then((m) =>
    runInInjectionContext(injector, () => m.tierAvancadoGuard(route, state)),
  ) as Promise<GuardResult>;
};
