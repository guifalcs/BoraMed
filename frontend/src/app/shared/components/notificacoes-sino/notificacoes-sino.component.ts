import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Info,
  LucideIconData,
  Trophy,
  Zap,
} from 'lucide-angular';
import { AppNotificacaoService } from '../../../core/services/app-notification.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type { AppNotificacao, AppNotificacaoTipo } from '../../../core/models/app-notification.types';

interface TipoConfig {
  icon: LucideIconData;
  bg: string;
  color: string;
}

const TIPO_CONFIG: Record<AppNotificacaoTipo, TipoConfig> = {
  info:      { icon: Info,          bg: '#dbeafe', color: '#1d4ed8' },
  sistema:   { icon: Zap,           bg: '#ede9fe', color: '#6d28d9' },
  aviso:     { icon: AlertTriangle, bg: '#fef3c7', color: '#92400e' },
  conquista: { icon: Trophy,        bg: '#d1fae5', color: '#065f46' },
};

interface DropdownPos {
  top: number;
  left: number;
  openUp: boolean;
}

const DROPDOWN_ESTIMATED_H = 380;
const DROPDOWN_GAP = 8;

@Component({
  selector: 'app-notificacoes-sino',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './notificacoes-sino.component.html',
  styleUrl: './notificacoes-sino.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificacoesSinoComponent implements OnInit {
  private readonly notifService = inject(AppNotificacaoService);
  private readonly elRef = inject(ElementRef);

  /** Quando true, usa position:fixed calculado para escapar do overflow:hidden do sidebar. */
  sidebar = input(false);

  protected readonly aberto = signal(false);
  protected readonly windowHeight = signal(typeof window !== 'undefined' ? window.innerHeight : 800);
  /** Posição calculada para modo sidebar (position:fixed). */
  protected readonly fixedPos = signal<DropdownPos | null>(null);
  /** Direção para modo não-sidebar (position:absolute via CSS). */
  protected readonly openUp = signal(false);

  protected readonly iconBell = Bell;
  protected readonly iconCheck = CheckCheck;
  protected readonly tipoConfig = (tipo: AppNotificacaoTipo): TipoConfig =>
    TIPO_CONFIG[tipo] ?? TIPO_CONFIG.info;
  protected readonly notificacoes = this.notifService.notificacoes;
  protected readonly naoLidas = this.notifService.naoLidas;
  protected readonly badgeLabel = computed(() => {
    const n = this.naoLidas();
    return n > 99 ? '99+' : n > 0 ? String(n) : '';
  });

  async ngOnInit(): Promise<void> {
    await this.notifService.carregar();
  }

  protected toggleAberto(): void {
    const next = !this.aberto();
    if (next) {
      const rect = (this.elRef.nativeElement as HTMLElement).getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < DROPDOWN_ESTIMATED_H && spaceAbove > spaceBelow;

      if (this.sidebar()) {
        this.fixedPos.set({
          top: shouldOpenUp ? rect.top : rect.bottom + DROPDOWN_GAP,
          left: rect.right + DROPDOWN_GAP,
          openUp: shouldOpenUp,
        });
      } else {
        // Sempre fixed para escapar de qualquer stacking context
        this.fixedPos.set({
          top: shouldOpenUp ? rect.top : rect.bottom + DROPDOWN_GAP,
          left: Math.max(8, rect.right - 320), // alinha pela direita do botão
          openUp: shouldOpenUp,
        });
      }
    }
    this.aberto.set(next);
  }

  protected async marcarLida(notif: AppNotificacao): Promise<void> {
    if (!notif.lida) {
      await this.notifService.marcarLida(notif.id);
    }
  }

  protected async marcarTodasLidas(): Promise<void> {
    await this.notifService.marcarTodasLidas();
  }

  protected formatarData(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-notificacoes-sino')) {
      this.aberto.set(false);
    }
  }
}
