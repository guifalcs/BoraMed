import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArrowLeft, ShieldCheck, TriangleAlert, type LucideIconData } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { CheckoutService } from '../../core/services/checkout.service';
import { MercadoPagoSdkService, SDK_ERRO_CARREGAMENTO } from '../../core/services/mercado-pago-sdk.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { mapStatusDetail } from '../../core/models/mp-status-detail.map';
import type {
  BrickController,
  BrickFormData,
  BrickSubmitData,
  ProcessarPagamentoResponse,
} from '../../core/models/checkout.types';
import type { Plano } from '../../core/models/subscription.types';

const BRICK_CONTAINER_ID = 'payment-brick-container';

/** Dados voláteis (QR do Pix, link do boleto, challenge 3DS) passados à tela
 * de status via sessionStorage — a intenção no banco não guarda o QR. */
export const CHECKOUT_RESULT_KEY_PREFIX = 'boramed_checkout_result_';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterLink, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 px-4 py-8">
      <div class="mx-auto max-w-lg">
        <a
          routerLink="/planos"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <app-ui-icon [icon]="voltarIcon" [size]="16" />
          Voltar aos planos
        </a>

        @if (carregando()) {
          <div class="mt-6 space-y-4">
            <div class="h-24 animate-pulse rounded-2xl bg-gray-200"></div>
            <div class="h-96 animate-pulse rounded-2xl bg-gray-200"></div>
          </div>
        } @else if (erroFatal()) {
          <div class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p class="text-sm text-red-700">{{ erroFatal() }}</p>
            <button
              type="button"
              (click)="recarregar()"
              class="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Tentar novamente
            </button>
          </div>
        } @else if (plano()) {
          <!-- Resumo do plano (preço do banco; o valor cobrado é validado no servidor) -->
          <div class="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
            <div class="flex items-center justify-between">
              <div>
                <h1 class="text-lg font-bold text-gray-900">Plano {{ plano()!.nome }}</h1>
                <p class="mt-0.5 text-sm text-gray-500">{{ descricaoPlano() }}</p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-extrabold text-gray-900">{{ precoFormatado() }}</p>
                <p class="text-xs text-gray-500">{{ notaPreco() }}</p>
              </div>
            </div>
          </div>

          <!-- Recusa: mensagem específica por status_detail + orientação -->
          @if (recusa()) {
            <div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-4" role="alert" data-testid="checkout-recusa">
              <div class="flex gap-2.5">
                <app-ui-icon [icon]="alertaIcon" [size]="18" class="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <p class="text-sm font-semibold text-red-800">{{ recusa()!.titulo }}</p>
                  <p class="mt-0.5 text-sm text-red-700">{{ recusa()!.mensagem }}</p>
                </div>
              </div>
            </div>
          }

          <!-- Container do Payment Brick (campos de cartão em iframes PCI do MP) -->
          <div class="mt-4 rounded-2xl border border-gray-200 bg-white p-2 sm:p-4">
            @if (montandoBrick()) {
              <div class="space-y-3 p-4" data-testid="brick-skeleton">
                <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
                <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
                <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
              </div>
            }
            <div [id]="brickContainerId"></div>
          </div>

          <p class="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-gray-400">
            <app-ui-icon [icon]="escudoIcon" [size]="14" class="mt-0.5 shrink-0" />
            <span>
              Pagamento processado pelo Mercado Pago. Os dados do cartão são digitados em campos
              seguros e criptografados do próprio Mercado Pago e nunca passam pelos servidores do
              BoraMed.
            </span>
          </p>
        }
      </div>
    </div>
  `,
})
export class CheckoutComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly subscription = inject(SubscriptionService);
  private readonly checkout = inject(CheckoutService);
  private readonly sdk = inject(MercadoPagoSdkService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly voltarIcon: LucideIconData = ArrowLeft;
  readonly escudoIcon: LucideIconData = ShieldCheck;
  readonly alertaIcon: LucideIconData = TriangleAlert;
  readonly brickContainerId = BRICK_CONTAINER_ID;

  readonly carregando = signal(true);
  readonly montandoBrick = signal(false);
  readonly erroFatal = signal<string | null>(null);
  readonly plano = signal<Plano | null>(null);
  readonly recusa = signal<{ titulo: string; mensagem: string } | null>(null);

  private brick: BrickController | null = null;

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return; // SSR renderiza o skeleton; o brick monta no browser

    // Quem já tem acesso não deve recomprar (a edge também barra com 409).
    if (await this.subscription.temAssinaturaAtivaServidor()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const slug = this.route.snapshot.paramMap.get('plano') ?? '';
    const planos = await this.subscription.listarPlanos();
    const plano = planos.find((p) => p.slug === slug) ?? null;
    if (!plano) {
      this.router.navigate(['/planos']);
      return;
    }
    this.plano.set(plano);
    this.carregando.set(false);
    // Recusa assíncrona (1ª cobrança da assinatura recusada após o usuário
    // sair do checkout): sem este aviso, ele perde o acesso sem ver o motivo.
    // Não bloqueia a montagem do Brick — o banner aparece quando resolver.
    void this.mostrarRecusaAnterior();
    await this.montarBrick(plano);
  }

  /** Banner com o motivo da última recusa (se for a intenção mais recente). */
  private async mostrarRecusaAnterior(): Promise<void> {
    const recusada = await this.checkout.ultimaIntencaoRecusada();
    if (!recusada || this.recusa()) return;
    const info = mapStatusDetail(recusada.status_detail);
    this.recusa.set({
      titulo: 'Seu último pagamento foi recusado',
      mensagem: recusada.tipo === 'assinatura'
        ? `${info.titulo}. Tente novamente — de preferência com outro cartão.`
        : info.mensagem,
    });
  }

  ngOnDestroy(): void {
    this.brick?.unmount();
    this.brick = null;
  }

  recarregar(): void {
    window.location.reload();
  }

  descricaoPlano(): string {
    const p = this.plano();
    if (!p) return '';
    if (p.recorrente) return 'Assinatura mensal — cancele quando quiser';
    const periodo = p.frequency === 1 ? '1 mês' : `${p.frequency} meses`;
    return `Acesso por ${periodo}, sem renovação automática`;
  }

  notaPreco(): string {
    const p = this.plano();
    if (!p) return '';
    if (p.recorrente) return 'por mês';
    const max = this.maxParcelas(p);
    return max > 1 ? `em até ${max}x sem juros` : 'pagamento único';
  }

  /** Parcelamento espelha o período de acesso (6 meses → 6x; 1 mês → à vista). */
  private maxParcelas(p: Plano): number {
    if (p.recorrente || p.frequency_type !== 'months') return 1;
    return Math.min(6, Math.max(1, p.frequency));
  }

  precoFormatado(): string {
    const p = this.plano();
    if (!p) return '';
    return (p.preco_centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: p.moeda || 'BRL',
    });
  }

  private async montarBrick(plano: Plano): Promise<void> {
    this.montandoBrick.set(true);
    // Recorrente (legado): só cartão em 1x. Pagamento único: cartão + Pix +
    // boleto, parcelado conforme o período do plano (mensal 1x, semestral 6x).
    const paymentMethods = plano.recorrente
      ? { creditCard: 'all', maxInstallments: 1 }
      : {
          creditCard: 'all',
          bankTransfer: 'all',
          ticket: 'all',
          maxInstallments: this.maxParcelas(plano),
        };
    try {
      this.brick = await this.sdk.createPaymentBrick(this.brickContainerId, {
        initialization: {
          amount: plano.preco_centavos / 100,
          payer: { email: this.auth.user()?.email ?? undefined },
        },
        customization: {
          paymentMethods,
          visual: {
            style: {
              customVariables: {
                baseColor: '#2451D8',
                borderRadiusMedium: '12px',
                borderRadiusLarge: '16px',
                formBackgroundColor: '#ffffff',
              },
            },
          },
        },
        callbacks: {
          onReady: () => this.montandoBrick.set(false),
          onSubmit: (data: BrickSubmitData) => this.submeter(plano, data),
          onError: (err: { message?: string }) => {
            // Erros de montagem/validação internos do Brick; os de pagamento
            // chegam pelo onSubmit. Não interrompe a página inteira.
            console.error('Payment Brick error:', err?.message);
          },
        },
      });
    } catch {
      this.montandoBrick.set(false);
      this.erroFatal.set(SDK_ERRO_CARREGAMENTO);
    }
  }

  /**
   * Chamado pelo Brick no clique em "Pagar". Rejeitar a promise reabilita o
   * botão do Brick para nova tentativa (com token novo + attempt_id novo).
   */
  private async submeter(plano: Plano, data: BrickSubmitData): Promise<void> {
    this.recusa.set(null);
    if (plano.recorrente) {
      await this.submeterAssinatura(plano, data.formData);
    } else {
      await this.submeterPagamento(plano, data.formData);
    }
  }

  private async submeterPagamento(plano: Plano, formData: BrickFormData): Promise<void> {
    const res = await this.checkout.processarPagamento(plano.slug, formData);
    if (!res.ok) {
      this.recusa.set({ titulo: 'Não foi possível processar', mensagem: res.error });
      throw new Error(res.error);
    }
    if (res.status === 'rejected') {
      this.recusa.set(mapStatusDetail(res.status_detail));
      throw new Error(res.status_detail ?? 'rejected');
    }
    // approved / pending (pix, boleto, 3DS, em análise) → tela de status.
    this.guardarResultado(res);
    this.router.navigate(['/checkout/status', res.intencao_id]);
  }

  private async submeterAssinatura(plano: Plano, formData: BrickFormData): Promise<void> {
    if (!formData.token) {
      this.recusa.set({
        titulo: 'Dados do cartão incompletos',
        mensagem: 'Preencha os dados do cartão para assinar.',
      });
      throw new Error('token ausente');
    }
    const res = await this.checkout.processarAssinatura(
      plano.slug,
      formData.token,
      formData.payer?.identification,
    );
    if (!res.ok) {
      this.recusa.set({ titulo: 'Não foi possível processar', mensagem: res.error });
      throw new Error(res.error);
    }
    if (res.status === 'rejected') {
      this.recusa.set(mapStatusDetail(res.status_detail));
      throw new Error(res.status_detail ?? 'rejected');
    }
    this.router.navigate(['/checkout/status', res.intencao_id]);
  }

  /** Persiste QR do Pix / boleto / 3DS para a tela de status (e reloads). */
  private guardarResultado(res: ProcessarPagamentoResponse): void {
    try {
      sessionStorage.setItem(
        `${CHECKOUT_RESULT_KEY_PREFIX}${res.intencao_id}`,
        JSON.stringify(res),
      );
    } catch {
      /* storage indisponível: a tela de status cai no fluxo de reconsulta */
    }
  }
}
