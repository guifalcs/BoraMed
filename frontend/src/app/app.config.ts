import { ApplicationConfig } from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      // Pré-carrega os chunks lazy em background após o load inicial, para que
      // o clique de navegação não pague o download do chunk pela rede.
      withPreloading(PreloadAllModules),
      // Transição suave entre rotas (progressive enhancement no browser).
      withViewTransitions(),
    ),
    // Hidratação sem withEventReplay: o event-replay injeta um <script> inline
    // por página (lista de eventos via __jsaction_bootstrap), cujo hash varia por
    // página — inviável de autorizar num CSP estático sem 'unsafe-inline'. Sem ele,
    // o único script inline restante é estável e pode ser liberado por hash SHA-256.
    provideClientHydration(),
  ],
};
