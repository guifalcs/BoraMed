import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { X, type LucideIconData } from 'lucide-angular';
import { CheckoutService } from '../../core/services/checkout.service';
import { MercadoPagoSdkService, SDK_ERRO_CARREGAMENTO } from '../../core/services/mercado-pago-sdk.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import type { BrickController, BrickSubmitData } from '../../core/models/checkout.types';

const CONTAINER_ID = 'trocar-cartao-brick-container';

// Modal de troca do cartão da assinatura mensal: Brick só-cartão gera um card
// token novo → mp-gerenciar-assinatura {acao:'trocar_cartao'}. O valor exibido
// no Brick é o da mensalidade (nenhuma cobrança é feita aqui; o MP valida o
// cartão e as próximas cobranças usam o novo cartão).

@Component({
  selector: 'app-trocar-cartao-modal',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Trocar cartão da assinatura">
      <div class="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-gray-900">Trocar cartão</h2>
          <button
            type="button"
            (click)="fechar.emit()"
            class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            <app-ui-icon [icon]="fecharIcon" [size]="18" />
          </button>
        </div>
        <p class="mt-1 text-sm text-gray-500">
          As próximas cobranças da assinatura usarão o novo cartão. Nenhum valor é cobrado agora.
        </p>

        @if (erro()) {
          <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ erro() }}</p>
        }
        @if (sucesso()) {
          <p class="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Cartão atualizado com sucesso!
          </p>
        }

        <div class="mt-3">
          @if (montando()) {
            <div class="space-y-3 py-2">
              <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
              <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
            </div>
          }
          <div [id]="containerId"></div>
        </div>
      </div>
    </div>
  `,
})
export class TrocarCartaoModalComponent implements OnInit, OnDestroy {
  /** Valor da mensalidade (centavos) exibido no Brick — nenhuma cobrança aqui. */
  valorCentavos = input.required<number>();
  fechar = output<void>();
  trocado = output<void>();

  private readonly sdk = inject(MercadoPagoSdkService);
  private readonly checkout = inject(CheckoutService);

  readonly fecharIcon: LucideIconData = X;
  readonly containerId = CONTAINER_ID;
  readonly montando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly sucesso = signal(false);

  private brick: BrickController | null = null;

  async ngOnInit(): Promise<void> {
    try {
      this.brick = await this.sdk.createPaymentBrick(this.containerId, {
        initialization: { amount: this.valorCentavos() / 100 },
        customization: {
          paymentMethods: { creditCard: 'all', maxInstallments: 1 },
          visual: {
            style: {
              customVariables: { baseColor: '#2451D8', borderRadiusMedium: '12px' },
            },
          },
        },
        callbacks: {
          onReady: () => this.montando.set(false),
          onSubmit: (data: BrickSubmitData) => this.submeter(data),
          onError: (err: { message?: string }) =>
            console.error('Payment Brick (trocar cartão) error:', err?.message),
        },
      });
    } catch {
      this.montando.set(false);
      this.erro.set(SDK_ERRO_CARREGAMENTO);
    }
  }

  ngOnDestroy(): void {
    this.brick?.unmount();
    this.brick = null;
  }

  private async submeter(data: BrickSubmitData): Promise<void> {
    this.erro.set(null);
    const token = data.formData.token;
    if (!token) {
      this.erro.set('Preencha os dados do cartão.');
      throw new Error('token ausente');
    }
    const res = await this.checkout.trocarCartao(token);
    if (!res.ok) {
      this.erro.set(res.error ?? 'Não foi possível trocar o cartão.');
      throw new Error(res.error);
    }
    this.sucesso.set(true);
    setTimeout(() => this.trocado.emit(), 1200);
  }
}
