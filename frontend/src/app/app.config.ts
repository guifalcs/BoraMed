import { ApplicationConfig } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { routes } from './app.routes';
import { BoraMedTitleStrategy } from './core/seo/title.strategy';
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
    // Mantém o <title> coerente com a tela atual em toda navegação — sem ela,
    // o título da primeira rota visitada fica preso na aba. Ver title.strategy.ts.
    { provide: TitleStrategy, useClass: BoraMedTitleStrategy },
  ],
};
