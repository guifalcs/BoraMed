import { ApplicationConfig } from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
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
    provideClientHydration(withEventReplay()),
  ],
};
