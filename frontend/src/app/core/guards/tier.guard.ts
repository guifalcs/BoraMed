import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';

// Gate de tier: recursos exclusivos do plano Avançado (materiais, flashcards,
// montar simulado). Roda DEPOIS do subscriptionGuard (que já garante
// autenticação + assinatura ativa/admin no /dashboard) — aqui só decidimos
// entre 'essencial' e 'avancado'. Sem acesso ativo nenhum, o subscriptionGuard
// já teria redirecionado para /planos antes deste guard ser avaliado.
export const tierAvancadoGuard: CanActivateFn = async (_route, _state) => {
  const auth = inject(AuthService);
  const profileService = inject(ProfileService);
  const subscription = inject(SubscriptionService);
  const router = inject(Router);

  await auth.initialize();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);

  if (!profileService.profile()) {
    await profileService.loadProfile();
  }

  const papel = profileService.profile()?.papel;
  if (papel === 'admin' || papel === 'super_admin') return true;

  // Consulta autoritativa no servidor (evita estado obsoleto entre usuários).
  const tier = await subscription.tierAtivoServidor();
  if (tier === 'avancado') return true;

  return router.createUrlTree(['/planos']);
};
