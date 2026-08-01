import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';

/**
 * Exige acesso PAGO (essencial ou avançado). Substitui o antigo
 * `subscriptionGuard` nas rotas que continuam sendo benefício de assinante,
 * hoje só a impressão de simulados.
 *
 * O /dashboard deixou de usar este guard: com o plano gratuito, o app é
 * acessível a qualquer autenticado e o gating desceu para as RPCs
 * (`iniciar_tentativa` com P0015/P0016) e para o `tierAvancadoGuard` nas rotas
 * de materiais, flashcards e montar simulado.
 */
export const nivelPagoGuard: CanActivateFn = async (_route, state) => {
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
  const nivel = await subscription.nivelAcessoServidor();
  if (nivel !== 'gratuito') return true;

  return router.createUrlTree(['/planos'], {
    queryParams: { origem: contextoDaRota(state?.url) },
  });
};

/** Rótulo do contexto que levou ao paywall, para /planos abrir com a copy certa. */
function contextoDaRota(url: string | undefined): string {
  return url?.startsWith('/imprimir') ? 'impressao' : 'recurso-pago';
}
