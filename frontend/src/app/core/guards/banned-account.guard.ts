import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

export const bannedAccountGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const profileService = inject(ProfileService);
  const router = inject(Router);

  await auth.initialize();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (!profileService.profile()) {
    await profileService.loadProfile();
  }

  return profileService.profile()?.banido
    ? true
    : router.createUrlTree(['/dashboard']);
};
