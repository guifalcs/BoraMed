import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProfileService } from '../services/profile.service';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const profileService = inject(ProfileService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (!profileService.profile()) {
    await profileService.loadProfile();
  }

  const papel = profileService.profile()?.papel;
  if (papel === 'admin' || papel === 'super_admin') {
    return true;
  }

  return router.createUrlTree(['/sem-permissao']);
};
