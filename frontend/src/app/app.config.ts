import { ApplicationConfig } from '@angular/core';
import {
  provideRouter,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { routes } from './app.routes';
import { SelectivePreloadingStrategy } from './core/selective-preloading.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      // Pré-carrega em background só os chunks lazy marcados com
      // `data: { preload: true }` (rotas de aluno mais acessadas). Evita
      // baixar telas admin ou telas pesadas (chart.js) que a maioria nunca abre.
      withPreloading(SelectivePreloadingStrategy),
      // Transição suave entre rotas (progressive enhancement no browser).
      withViewTransitions(),
    ),
    provideClientHydration(withEventReplay()),
  ],
};
