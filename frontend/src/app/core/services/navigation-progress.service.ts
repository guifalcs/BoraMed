import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';

/**
 * Estado global da barra de progresso no topo da aplicação.
 *
 * Acende em dois casos:
 *  - durante a navegação do router (guards lazy + download de chunks);
 *  - durante carregamentos de dados de página registrados via `track()`,
 *    permitindo navegar instantaneamente e ainda dar feedback enquanto os
 *    dados chegam (substitui o bloqueio invisível dos resolvers).
 */
@Injectable({ providedIn: 'root' })
export class NavigationProgressService {
  private readonly _routerLoading = signal(false);
  private readonly _tasks = signal(0);

  /** `true` enquanto houver navegação ou carregamento de dados em andamento. */
  readonly loading = computed(() => this._routerLoading() || this._tasks() > 0);

  constructor() {
    const router = inject(Router);
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this._routerLoading.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        this._routerLoading.set(false);
      }
    });
  }

  /** Envolve um carregamento de dados de página, acendendo a barra enquanto roda. */
  track<T>(work: Promise<T>): Promise<T> {
    this._tasks.update((n) => n + 1);
    return work.finally(() => this._tasks.update((n) => Math.max(0, n - 1)));
  }
}
