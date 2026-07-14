import { Injectable, signal } from '@angular/core';

/**
 * Visualizador de imagem em tela cheia (lightbox), global. Um único
 * <app-image-viewer> é montado no shell do dashboard (fora do .main-content, que
 * tem `isolation: isolate` e prenderia o overlay atrás da sidebar). Qualquer
 * componente injeta este serviço e chama `abrir(url)` para exibir a imagem
 * centralizada sobre TODA a viewport, sidebar inclusa.
 */
@Injectable({ providedIn: 'root' })
export class ImageViewerService {
  private readonly urlSig = signal<string | null>(null);
  readonly url = this.urlSig.asReadonly();

  abrir(url: string): void {
    this.urlSig.set(url);
  }

  fechar(): void {
    this.urlSig.set(null);
  }
}
