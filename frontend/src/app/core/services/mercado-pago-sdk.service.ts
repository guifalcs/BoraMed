import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import type { BrickController } from '../models/checkout.types';

// Loader lazy do SDK v2 do Mercado Pago + factories dos Bricks usados no
// checkout embutido. O script só é injetado no browser (o app tem SSR) e sob
// demanda — a landing e o resto do app não pagam o custo do SDK.
// O SDK coleta o device ID automaticamente ao carregar (exigência de score).
// Regra dos Bricks em SPA: quem cria o brick DEVE chamar controller.unmount()
// no ngOnDestroy.

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const SDK_TIMEOUT_MS = 10_000;

export const SDK_ERRO_CARREGAMENTO =
  'Não foi possível carregar o pagamento seguro do Mercado Pago. Verifique sua conexão (ou extensões de bloqueio) e recarregue a página.';

/** Superfície mínima do objeto MercadoPago que usamos (o SDK não publica tipos). */
interface MercadoPagoInstance {
  bricks(): {
    create(
      brick: string,
      containerId: string,
      settings: Record<string, unknown>,
    ): Promise<BrickController>;
  };
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, opts?: { locale?: string }) => MercadoPagoInstance;
  }
}

@Injectable({ providedIn: 'root' })
export class MercadoPagoSdkService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sdkPromise: Promise<MercadoPagoInstance> | null = null;

  /** Carrega o SDK (uma vez) e devolve a instância configurada em pt-BR. */
  loadSdk(): Promise<MercadoPagoInstance> {
    if (!this.isBrowser) {
      return Promise.reject(new Error('SDK do Mercado Pago só carrega no browser'));
    }
    this.sdkPromise ??= this.injectScript()
      .then(() => new window.MercadoPago!(environment.mercadoPagoPublicKey, { locale: 'pt-BR' }))
      .catch((e) => {
        // Permite nova tentativa após falha transitória (rede, adblock desativado).
        this.sdkPromise = null;
        throw e;
      });
    return this.sdkPromise;
  }

  /**
   * Monta o Payment Brick no container informado. `settings` segue o formato
   * do SDK ({ initialization, customization, callbacks }).
   */
  async createPaymentBrick(
    containerId: string,
    settings: Record<string, unknown>,
  ): Promise<BrickController> {
    const mp = await this.loadSdk();
    return mp.bricks().create('payment', containerId, settings);
  }

  /** Monta o Status Screen Brick (usado para o challenge 3DS). */
  async createStatusScreenBrick(
    containerId: string,
    settings: Record<string, unknown>,
  ): Promise<BrickController> {
    const mp = await this.loadSdk();
    return mp.bricks().create('statusScreen', containerId, settings);
  }

  private injectScript(): Promise<void> {
    if (window.MercadoPago) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(SDK_ERRO_CARREGAMENTO)), SDK_TIMEOUT_MS);
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
      const script = existing ?? document.createElement('script');
      const done = () => {
        clearTimeout(timeout);
        if (window.MercadoPago) resolve();
        else reject(new Error(SDK_ERRO_CARREGAMENTO));
      };
      script.addEventListener('load', done, { once: true });
      script.addEventListener('error', () => {
        clearTimeout(timeout);
        script.remove();
        reject(new Error(SDK_ERRO_CARREGAMENTO));
      }, { once: true });
      if (!existing) {
        script.src = SDK_URL;
        script.async = true;
        document.head.appendChild(script);
      } else if (window.MercadoPago) {
        done();
      }
    });
  }
}
