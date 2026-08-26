import { PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Seção de planos da landing (rota pública, com âncora). */
export const ANCORA_PLANOS_LANDING = '/#planos';

/**
 * Faz `/planos` servir aos dois estados de sessão a partir de UM único link
 * (o de campanha de e-mail, do Instagram, de qualquer lugar):
 *
 * - com sessão → segue para a tela de planos do app, já logado;
 * - sem sessão → vai para a seção de planos da landing, que é pública.
 *
 * Sem isto, o `authGuard` mandaria o deslogado para `/login` — e como ele não
 * guarda a rota de destino, a pessoa terminaria no `/dashboard` depois de
 * entrar, nunca na oferta que a fez clicar.
 *
 * Roda ANTES do `authGuard` na mesma rota: quando devolve `true`, é o authGuard
 * que continua tratando sessão de recovery, conta suspensa e vínculo pendente
 * de assinatura.
 *
 * O desvio é feito com `location.replace`, não com `Router`: a âncora precisa
 * de um carregamento de página para o browser rolar até a seção (o router não
 * está com `anchorScrolling` ligado), e `replace` mantém `/planos` fora do
 * histórico, senão o "voltar" cairia no mesmo desvio de novo.
 */
export const planosPublicoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const doc = inject(DOCUMENT);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  await auth.initialize();

  if (auth.isAuthenticated()) return true;

  const janela = isBrowser ? doc.defaultView : null;
  if (!janela) {
    // Sem browser (SSR/prerender) não há como rolar até a âncora; o UrlTree ao
    // menos leva à landing. Hoje `/planos` é RenderMode.Client, então este
    // caminho só existe como rede de segurança.
    return router.createUrlTree(['/'], { fragment: 'planos' });
  }

  janela.location.replace(ANCORA_PLANOS_LANDING);
  return false;
};
