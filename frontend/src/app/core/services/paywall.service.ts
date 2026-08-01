import { Injectable, computed, signal } from '@angular/core';
import { PAYWALL_CONTEUDO, type PaywallContexto } from '../models/paywall.types';

/**
 * Estado do modal de paywall. Fica num serviço para qualquer tela disparar o
 * upsell sem prop drilling: o `<app-paywall-modal />` é montado uma única vez
 * no shell do dashboard e escuta este signal.
 */
@Injectable({ providedIn: 'root' })
export class PaywallService {
  private readonly _contexto = signal<PaywallContexto | null>(null);

  readonly contexto = this._contexto.asReadonly();
  readonly aberto = computed(() => this._contexto() !== null);
  readonly conteudo = computed(() => {
    const ctx = this._contexto();
    return ctx ? PAYWALL_CONTEUDO[ctx] : null;
  });

  abrir(contexto: PaywallContexto): void {
    this._contexto.set(contexto);
  }

  fechar(): void {
    this._contexto.set(null);
  }
}
