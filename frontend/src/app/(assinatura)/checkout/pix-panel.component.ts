import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Copy, QrCode, type LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import type { PixInfo } from '../../core/models/checkout.types';

// Painel do Pix: QR Code, copia-e-cola e countdown até a expiração (30min).
// O polling do status é do componente pai (tela de status); aqui só avisamos
// quando o prazo estoura via `expirou`.

@Component({
  selector: 'app-pix-panel',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text-center">
      <p class="text-sm text-gray-600">
        Escaneie o QR Code no app do seu banco ou copie o código abaixo.
        <span class="font-medium text-gray-900">O acesso é liberado na hora</span> após o pagamento.
      </p>

      @if (pix().qr_code_base64) {
        <img
          [src]="'data:image/png;base64,' + pix().qr_code_base64"
          alt="QR Code do Pix"
          class="mx-auto mt-4 h-52 w-52 rounded-xl border border-gray-200 bg-white p-2"
          data-testid="pix-qr"
        />
      } @else {
        <div class="mx-auto mt-4 flex h-52 w-52 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
          <app-ui-icon [icon]="qrIcon" [size]="48" class="text-gray-300" />
        </div>
      }

      @if (tempoRestante(); as restante) {
        <p class="mt-3 text-sm text-gray-500" data-testid="pix-countdown">
          Este código expira em <span class="font-semibold tabular-nums text-gray-900">{{ restante }}</span>
        </p>
      }

      <div class="mt-4">
        <div class="flex items-stretch gap-2">
          <input
            type="text"
            readonly
            [value]="pix().qr_code"
            class="w-full truncate rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600"
            aria-label="Código Pix copia e cola"
          />
          <button
            type="button"
            (click)="copiar()"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            data-testid="pix-copiar"
          >
            <app-ui-icon [icon]="copiarIcon" [size]="15" />
            {{ copiado() ? 'Copiado!' : 'Copiar' }}
          </button>
        </div>
      </div>

      <p class="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
        <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
        Aguardando pagamento — esta página atualiza sozinha.
      </p>
    </div>
  `,
})
export class PixPanelComponent implements OnInit, OnDestroy {
  pix = input.required<PixInfo>();
  expirou = output<void>();

  readonly qrIcon: LucideIconData = QrCode;
  readonly copiarIcon: LucideIconData = Copy;
  readonly copiado = signal(false);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly agora = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  private avisouExpiracao = false;

  readonly tempoRestante = computed<string | null>(() => {
    const exp = this.pix().expira_em;
    if (!exp) return null;
    const ms = new Date(exp).getTime() - this.agora();
    if (ms <= 0) return '00:00';
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.timer = setInterval(() => {
      this.agora.set(Date.now());
      const exp = this.pix().expira_em;
      if (!this.avisouExpiracao && exp && new Date(exp).getTime() <= Date.now()) {
        this.avisouExpiracao = true;
        this.expirou.emit();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pix().qr_code);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      /* clipboard bloqueado: o input readonly permite copiar manualmente */
    }
  }
}
