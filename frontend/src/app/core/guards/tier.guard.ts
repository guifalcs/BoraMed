import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';

/**
 * Gate de tier: recursos exclusivos do plano Avançado (materiais, flashcards,
 * montar simulado). Vale tanto para quem está no plano gratuito quanto no
 * essencial — desde o free tier, `tierAtivoServidor()` devolve null nos dois
 * casos e o redirect é o mesmo, só muda a copy em /planos via `origem`.
 */
export const tierAvancadoGuard: CanActivateFn = async (_route, state) => {
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

  return router.createUrlTree(['/planos'], {
    queryParams: { origem: contextoDaRota(state?.url) },
  });
};

/** Rótulo do contexto que levou ao paywall, para /planos abrir com a copy certa. */
function contextoDaRota(url: string | undefined): string {
  const path = url?.split(/[?#]/)[0] ?? '';
  if (path.startsWith('/dashboard/materiais')) return 'materiais';
  if (path.startsWith('/dashboard/flashcards')) return 'flashcards';
  if (path.startsWith('/imprimir')) return 'impressao';
  if (path.includes('/simulados/montar')) return 'simulado-personalizado';
  return 'recurso-pago';
}
