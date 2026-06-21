import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PENDING_PREAPPROVAL_KEY, SubscriptionService } from '../../core/services/subscription.service';

// Landing do back_url do Mercado Pago. A confirmação do pagamento chega pelo
// webhook (assíncrono): cartão em segundos; Pix em minutos; boleto pode levar
// dias. Fazemos polling curto e, se não confirmar a tempo, explicamos e
// oferecemos uma verificação manual — o acesso é liberado de qualquer forma
// quando o webhook aprovar.
@Component({
  selector: 'app-assinatura-retorno',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div class="max-w-md text-center">
        @if (estado() === 'processando') {
          <div class="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
          <h1 class="text-xl font-bold text-gray-900">Confirmando seu pagamento…</h1>
          <p class="mt-2 text-gray-600">Isso costuma levar só alguns segundos.</p>
        } @else if (estado() === 'ok') {
          <h1 class="text-xl font-bold text-green-700">Assinatura ativada! 🎉</h1>
          <p class="mt-2 text-gray-600">Redirecionando para o painel…</p>
        } @else {
          <h1 class="text-xl font-bold text-gray-900">Pagamento em processamento</h1>
          <p class="mt-2 text-gray-600">
            Se você pagou com <b>cartão</b>, normalmente leva segundos. Com <b>Pix</b> pode levar
            alguns minutos e com <b>boleto</b>, até alguns dias úteis. Você receberá o acesso
            <b>automaticamente</b> assim que o pagamento for confirmado — não precisa pagar de novo.
          </p>
          <div class="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              (click)="verificarNovamente()"
              [disabled]="verificando()"
              class="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {{ verificando() ? 'Verificando…' : 'Já paguei, verificar de novo' }}
            </button>
            <button
              type="button"
              (click)="irParaInicio()"
              class="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Ir para o painel
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class AssinaturaRetornoComponent implements OnInit, OnDestroy {
  private readonly subscription = inject(SubscriptionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly estado = signal<'processando' | 'ok' | 'timeout'>('processando');
  readonly verificando = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tentativas = 0;
  private readonly maxTentativas = 12;

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;

    // O Mercado Pago devolve o preapproval_id na back_url após a assinatura recorrente.
    const preapprovalId = this.route.snapshot.queryParamMap.get('preapproval_id');

    await this.auth.initialize();
    if (!this.auth.isAuthenticated()) {
      // Sessão ausente (ex.: voltou do MP em outra janela). Guarda o id e manda
      // logar; o subscription.guard retoma o vínculo após o login.
      if (preapprovalId) sessionStorage.setItem(PENDING_PREAPPROVAL_KEY, preapprovalId);
      this.router.navigate(['/login']);
      return;
    }

    if (preapprovalId) {
      await this.subscription.vincular(preapprovalId);
    }
    this.poll();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private async poll(): Promise<void> {
    if (await this.confirmou()) return;
    this.tentativas++;
    if (this.tentativas >= this.maxTentativas) {
      this.estado.set('timeout');
      return;
    }
    this.timer = setTimeout(() => this.poll(), 2000);
  }

  /** Uma verificação; se confirmado, marca ok e redireciona. Retorna se confirmou. */
  private async confirmou(): Promise<boolean> {
    const ativa = await this.subscription.temAssinaturaAtivaServidor();
    if (ativa) {
      await this.subscription.carregarAssinatura();
      this.estado.set('ok');
      this.timer = setTimeout(() => this.router.navigate(['/dashboard']), 1500);
    }
    return ativa;
  }

  async verificarNovamente(): Promise<void> {
    this.verificando.set(true);
    await this.confirmou();
    this.verificando.set(false);
  }

  irParaInicio(): void {
    this.router.navigate(['/dashboard']);
  }
}
