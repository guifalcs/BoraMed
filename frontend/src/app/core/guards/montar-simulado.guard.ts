import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';

/**
 * Gate de `/dashboard/simulados/montar`.
 *
 * Não é o `tierAvancadoGuard`, e a diferença é proposital: o único nível
 * barrado aqui é o **essencial**. O gratuito passa, gastando o crédito único de
 * simulado montado (ver migration 20260908120000) — o que separa o grátis do
 * Essencial é o teto de tentativas, não o catálogo.
 *
 * Quem já esgotou o crédito continua entrando na tela: o bloqueio acontece no
 * `gerar_simulado_personalizado` (P0016), e a tela avisa antes de o aluno
 * montar a prova. Barrar a rota inteira esconderia o recurso justamente de
 * quem está no momento de decidir assinar.
 */
export const montarSimuladoGuard: CanActivateFn = async () => {
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
  if (nivel !== 'essencial') return true;

  return router.createUrlTree(['/planos'], {
    queryParams: { origem: 'simulado-personalizado' },
  });
};
