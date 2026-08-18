import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PreloadingStrategy, Route } from '@angular/router';

/**
 * Só pré-carrega chunks lazy marcados explicitamente com `data: { preload: true }`
 * na definição da rota. Evita baixar em background rotas pesadas (ex.: telas
 * admin, telas com chart.js) que a maioria dos alunos nunca acessa.
 */
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] === true ? load() : of(null);
  }
}
