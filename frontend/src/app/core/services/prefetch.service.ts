import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Prefetches the most likely post-login route chunks during idle time.
 * Only triggers in the browser, avoids admin/rare routes.
 */
@Injectable({ providedIn: 'root' })
export class PrefetchService {
  private readonly platformId = inject(PLATFORM_ID);
  private prefetched = false;

  /**
   * Call after successful login to preload dashboard chunks in idle time.
   */
  prefetchDashboardRoutes(): void {
    if (this.prefetched || !isPlatformBrowser(this.platformId)) return;
    this.prefetched = true;

    const idle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => setTimeout(cb, 200));

    idle(() => {
      // Preload dashboard shell
      void import('../../(dashboard)/dashboard.component');
      void import('../../(dashboard)/dashboard.routes');
    });

    idle(() => {
      // Preload most-accessed child routes
      void import('../../(dashboard)/inicio/inicio.component');
      void import('../../(dashboard)/provas/provas.routes');
    });

    idle(() => {
      void import('../../(dashboard)/historico/historico.component');
      void import('../../(dashboard)/perfil/perfil.component');
    });
  }
}
