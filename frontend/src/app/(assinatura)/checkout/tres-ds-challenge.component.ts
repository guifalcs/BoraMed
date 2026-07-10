import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MercadoPagoSdkService } from '../../core/services/mercado-pago-sdk.service';
import type { BrickController, ThreeDsInfo } from '../../core/models/checkout.types';

// Challenge 3DS via Status Screen Brick: o brick renderiza o iframe do banco
// emissor (externalResourceURL + creq) e acompanha a conclusão. O polling do
// resultado é do componente pai (tela de status).

const CONTAINER_ID = 'status-screen-brick-container';

@Component({
  selector: 'app-tres-ds-challenge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (carregando()) {
      <div class="space-y-3 p-4" data-testid="tres-ds-skeleton">
        <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
        <div class="h-64 animate-pulse rounded-lg bg-gray-100"></div>
      </div>
    }
    @if (erro()) {
      <p class="p-4 text-center text-sm text-red-600">{{ erro() }}</p>
    }
    <div [id]="containerId"></div>
  `,
})
export class TresDsChallengeComponent implements OnInit, OnDestroy {
  paymentId = input.required<string>();
  threeDs = input.required<ThreeDsInfo>();

  private readonly sdk = inject(MercadoPagoSdkService);
  readonly containerId = CONTAINER_ID;
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  private brick: BrickController | null = null;

  async ngOnInit(): Promise<void> {
    try {
      this.brick = await this.sdk.createStatusScreenBrick(this.containerId, {
        initialization: {
          paymentId: this.paymentId(),
          additionalInfo: {
            externalResourceURL: this.threeDs().external_resource_url,
            creq: this.threeDs().creq,
          },
        },
        callbacks: {
          onReady: () => this.carregando.set(false),
          onError: (err: { message?: string }) => {
            console.error('Status Screen Brick error:', err?.message);
            this.carregando.set(false);
            this.erro.set(
              'Não foi possível abrir a verificação do banco. Volte e tente o pagamento novamente.',
            );
          },
        },
      });
    } catch {
      this.carregando.set(false);
      this.erro.set(
        'Não foi possível abrir a verificação do banco. Volte e tente o pagamento novamente.',
      );
    }
  }

  ngOnDestroy(): void {
    this.brick?.unmount();
    this.brick = null;
  }
}
