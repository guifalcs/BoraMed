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
import {
  CircleCheck,
  Clock,
  ExternalLink,
  TriangleAlert,
  type LucideIconData,
} from 'lucide-angular';
import { CheckoutService } from '../../core/services/checkout.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { mapStatusDetail, type StatusDetailInfo } from '../../core/models/mp-status-detail.map';
import { PixPanelComponent } from './pix-panel.component';
import { TresDsChallengeComponent } from './tres-ds-challenge.component';
import { CHECKOUT_RESULT_KEY_PREFIX } from './checkout.component';
import type {
  PagamentoIntencao,
  ProcessarPagamentoResponse,
} from '../../core/models/checkout.types';

// Tela de status do pagamento (/checkout/status/:intencaoId). Estados:
//   aprovado  → confirma acesso (polling curto) e leva ao dashboard
//   pix       → QR + copia-e-cola + countdown + polling 3s
//   boleto    → link + "Já paguei, verificar"
//   3ds       → Status Screen Brick com o challenge do banco + polling
//   pendente  → em análise (pending_contingency / review_manual)
//   recusado  → mensagem específica + tentar novamente
//   expirado  → gerar novo Pix
// Reload reconstrói o estado: intenção via PostgREST (RLS own) + dados
// voláteis (QR/boleto/3DS) do sessionStorage gravado pelo checkout.

type TelaEstado = 'carregando' | 'aprovado' | 'pix' | 'boleto' | 'tres_ds' | 'pendente' | 'recusado' | 'expirado';

const POLL_MS = 3000;

@Component({
  selector: 'app-pagamento-status',
  standalone: true,
  imports: [CommonModule, RouterLink, UiIconComponent, PixPanelComponent, TresDsChallengeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 px-4 py-10">
      <div class="mx-auto max-w-lg">
        <div class="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          @switch (estado()) {
            @case ('carregando') {
              <div class="space-y-4" data-testid="status-skeleton">
                <div class="h-8 animate-pulse rounded-lg bg-gray-100"></div>
                <div class="h-40 animate-pulse rounded-lg bg-gray-100"></div>
              </div>
            }
            @case ('aprovado') {
              <div class="text-center" data-testid="status-aprovado">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <app-ui-icon [icon]="checkIcon" [size]="32" class="text-green-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">Pagamento aprovado!</h1>
                @if (liberandoAcesso()) {
                  <p class="mt-2 text-sm text-gray-600">Liberando seu acesso…</p>
                } @else {
                  <p class="mt-2 text-sm text-gray-600">Seu acesso está liberado. Bons estudos!</p>
                  <button
                    type="button"
                    (click)="irParaDashboard()"
                    class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                    data-testid="ir-dashboard"
                  >
                    Começar a estudar
                  </button>
                }
              </div>
            }
            @case ('pix') {
              <h1 class="text-center text-xl font-bold text-gray-900">Pague com Pix</h1>
              <div class="mt-4">
                @if (resultado()?.pix) {
                  <app-pix-panel [pix]="resultado()!.pix!" (expirou)="aoExpirarPix()" />
                } @else {
                  <!-- Reload sem os dados voláteis do QR: oferece regenerar -->
                  <p class="text-center text-sm text-gray-600">
                    Não encontramos o QR Code desta tentativa (a página foi recarregada).
                    Se você ainda não pagou, gere um novo código Pix.
                  </p>
                  <button
                    type="button"
                    (click)="novaTentativa()"
                    class="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Gerar novo Pix
                  </button>
                }
              </div>
            }
            @case ('boleto') {
              <div class="text-center" data-testid="status-boleto">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                  <app-ui-icon [icon]="relogioIcon" [size]="32" class="text-amber-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">Boleto gerado</h1>
                <p class="mt-2 text-sm text-gray-600">
                  O boleto compensa em até 2 dias úteis após o pagamento.
                  <span class="font-medium text-gray-900">Seu acesso será liberado automaticamente</span>
                  assim que o banco confirmar — avisaremos por aqui.
                </p>
                @if (resultado()?.boleto?.url) {
                  <a
                    [href]="resultado()!.boleto!.url"
                    target="_blank"
                    rel="noopener"
                    class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                    data-testid="boleto-link"
                  >
                    <app-ui-icon [icon]="externoIcon" [size]="16" />
                    Abrir boleto
                  </a>
                }
                <button
                  type="button"
                  (click)="verificarPagamento()"
                  [disabled]="verificando()"
                  class="mt-3 w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  data-testid="ja-paguei"
                >
                  {{ verificando() ? 'Verificando…' : 'Já paguei, verificar' }}
                </button>
                @if (verificacaoSemMudanca()) {
                  <p class="mt-2 text-xs text-gray-500">
                    Ainda não identificamos o pagamento. O banco pode levar até 2 dias úteis para compensar o boleto.
                  </p>
                }
              </div>
            }
            @case ('tres_ds') {
              <h1 class="text-center text-xl font-bold text-gray-900">Confirmação do seu banco</h1>
              <p class="mt-2 text-center text-sm text-gray-600">
                Conclua a verificação abaixo para finalizar o pagamento.
              </p>
              <div class="mt-4">
                @if (resultado()?.three_ds && resultado()?.payment_id) {
                  <app-tres-ds-challenge
                    [paymentId]="resultado()!.payment_id!"
                    [threeDs]="resultado()!.three_ds!"
                  />
                } @else {
                  <p class="text-center text-sm text-gray-600">
                    Não foi possível retomar a verificação (a página foi recarregada).
                    Confira no app do seu banco se a compra foi confirmada ou tente novamente.
                  </p>
                  <button
                    type="button"
                    (click)="verificarPagamento()"
                    [disabled]="verificando()"
                    class="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {{ verificando() ? 'Verificando…' : 'Verificar pagamento' }}
                  </button>
                }
              </div>
            }
            @case ('pendente') {
              <div class="text-center" data-testid="status-pendente">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                  <app-ui-icon [icon]="relogioIcon" [size]="32" class="text-amber-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">{{ infoPendente().titulo }}</h1>
                <p class="mt-2 text-sm text-gray-600">{{ infoPendente().mensagem }}</p>
                <p class="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"></span>
                  Acompanhando o resultado — esta página atualiza sozinha.
                </p>
              </div>
            }
            @case ('recusado') {
              <div class="text-center" data-testid="status-recusado">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <app-ui-icon [icon]="alertaIcon" [size]="32" class="text-red-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">{{ infoRecusa().titulo }}</h1>
                <p class="mt-2 text-sm text-gray-600">{{ infoRecusa().mensagem }}</p>
                <button
                  type="button"
                  (click)="novaTentativa()"
                  class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                  data-testid="tentar-novamente"
                >
                  Tentar novamente
                </button>
              </div>
            }
            @case ('expirado') {
              <div class="text-center" data-testid="status-expirado">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <app-ui-icon [icon]="relogioIcon" [size]="32" class="text-gray-500" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">O código expirou</h1>
                <p class="mt-2 text-sm text-gray-600">
                  Nenhum valor foi cobrado. Gere um novo código para concluir o pagamento.
                </p>
                <button
                  type="button"
                  (click)="novaTentativa()"
                  class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                  data-testid="gerar-novo"
                >
                  Gerar novo pagamento
                </button>
              </div>
            }
          }
        </div>

        @if (estado() !== 'aprovado') {
          <p class="mt-4 text-center text-xs text-gray-400">
            Problemas com o pagamento?
            <a routerLink="/planos" class="font-medium text-gray-500 hover:text-gray-700">Voltar aos planos</a>
          </p>
        }
      </div>
    </div>
  `,
})
export class PagamentoStatusComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly checkout = inject(CheckoutService);
  private readonly subscription = inject(SubscriptionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly checkIcon: LucideIconData = CircleCheck;
  readonly relogioIcon: LucideIconData = Clock;
  readonly alertaIcon: LucideIconData = TriangleAlert;
  readonly externoIcon: LucideIconData = ExternalLink;

  readonly estado = signal<TelaEstado>('carregando');
  readonly intencao = signal<PagamentoIntencao | null>(null);
  readonly resultado = signal<ProcessarPagamentoResponse | null>(null);
  readonly liberandoAcesso = signal(false);
  readonly verificando = signal(false);
  readonly verificacaoSemMudanca = signal(false);

  private intencaoId = '';
  private planoSlug: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;
    this.intencaoId = this.route.snapshot.paramMap.get('intencaoId') ?? '';
    if (!this.intencaoId) {
      this.router.navigate(['/planos']);
      return;
    }
    this.lerResultadoVolatil();
    const intencao = await this.checkout.obterIntencao(this.intencaoId);
    if (!intencao) {
      this.router.navigate(['/planos']);
      return;
    }
    await this.resolverPlanoSlug(intencao);
    this.aplicarIntencao(intencao);
  }

  ngOnDestroy(): void {
    this.pararPolling();
  }

  infoRecusa(): StatusDetailInfo {
    return mapStatusDetail(this.intencao()?.status_detail);
  }

  infoPendente(): StatusDetailInfo {
    return mapStatusDetail(this.intencao()?.status_detail ?? 'pending_contingency');
  }

  aoExpirarPix(): void {
    // O MP cancela o payment após a validade; refletimos já na UI.
    this.estado.set('expirado');
    this.pararPolling();
  }

  novaTentativa(): void {
    this.limparResultadoVolatil();
    this.router.navigate(this.planoSlug ? ['/checkout', this.planoSlug] : ['/planos']);
  }

  async verificarPagamento(): Promise<void> {
    this.verificando.set(true);
    this.verificacaoSemMudanca.set(false);
    const res = await this.checkout.consultarPagamento(this.intencaoId);
    this.verificando.set(false);
    if (res?.status === 'approved') {
      this.aoAprovar();
    } else {
      this.verificacaoSemMudanca.set(true);
      const intencao = await this.checkout.obterIntencao(this.intencaoId);
      if (intencao) this.aplicarIntencao(intencao);
    }
  }

  irParaDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ---- estado interno ----

  private aplicarIntencao(intencao: PagamentoIntencao): void {
    this.intencao.set(intencao);
    switch (intencao.status) {
      case 'aprovada':
        this.aoAprovar();
        return;
      case 'recusada':
        this.estado.set('recusado');
        this.pararPolling();
        return;
      case 'expirada':
      case 'cancelada':
        this.estado.set('expirado');
        this.pararPolling();
        return;
      default: {
        // criada / processando / pendente
        if (intencao.status_detail === 'pending_challenge') {
          this.estado.set('tres_ds');
        } else if (intencao.metodo === 'pix') {
          this.estado.set('pix');
        } else if (this.ehBoleto(intencao.metodo)) {
          this.estado.set('boleto');
        } else {
          this.estado.set('pendente');
        }
        this.iniciarPolling();
      }
    }
  }

  private ehBoleto(metodo: string | null): boolean {
    return !!metodo && metodo !== 'pix' && !this.resultado()?.pix && (metodo.startsWith('bol') || !!this.resultado()?.boleto);
  }

  private aoAprovar(): void {
    this.pararPolling();
    this.limparResultadoVolatil();
    this.estado.set('aprovado');
    void this.confirmarAcesso();
  }

  /** Polling curto do RPC até o acesso refletir (webhook/sync já gravou). */
  private async confirmarAcesso(): Promise<void> {
    this.liberandoAcesso.set(true);
    for (let i = 0; i < 10; i++) {
      if (await this.checkout.temAcessoServidor()) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    // Atualiza o estado local da assinatura para os guards/telas.
    await this.subscription.carregarAssinatura();
    this.liberandoAcesso.set(false);
  }

  private iniciarPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      const intencao = await this.checkout.obterIntencao(this.intencaoId);
      if (!intencao) return;
      const anterior = this.intencao();
      if (intencao.status !== anterior?.status || intencao.status_detail !== anterior?.status_detail) {
        this.aplicarIntencao(intencao);
      }
    }, POLL_MS);
  }

  private pararPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private lerResultadoVolatil(): void {
    try {
      const raw = sessionStorage.getItem(`${CHECKOUT_RESULT_KEY_PREFIX}${this.intencaoId}`);
      if (raw) this.resultado.set(JSON.parse(raw) as ProcessarPagamentoResponse);
    } catch {
      /* sem dados voláteis: os estados têm fallback de reconsulta */
    }
  }

  private limparResultadoVolatil(): void {
    try {
      sessionStorage.removeItem(`${CHECKOUT_RESULT_KEY_PREFIX}${this.intencaoId}`);
    } catch {
      /* ignore */
    }
  }

  private async resolverPlanoSlug(intencao: PagamentoIntencao): Promise<void> {
    if (!intencao.plano_id) return;
    const planos = await this.subscription.listarPlanos();
    this.planoSlug = planos.find((p) => p.id === intencao.plano_id)?.slug ?? null;
  }
}
