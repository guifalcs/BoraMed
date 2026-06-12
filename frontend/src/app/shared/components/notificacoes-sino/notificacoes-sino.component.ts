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

interface DropdownTamanho {
  w: number;
  h: number;
}

const DROPDOWN_ESTIMATED_H = 380;
const DROPDOWN_GAP = 8;
const DROPDOWN_DEFAULT_W = 320;
const DROPDOWN_MIN_W = 280;
const DROPDOWN_MIN_H = 240;
/* Margem mínima entre o dropdown e as bordas do viewport */
const VIEWPORT_MARGIN = 8;

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
  /** Tamanho definido pelo usuário; null = tamanho padrão do CSS. Vale só enquanto aberto. */
  protected readonly tamanho = signal<DropdownTamanho | null>(null);

  /** Estado do arrasto de redimensionamento (null = não está arrastando). */
  private resizeBase: { x: number; y: number; w: number; h: number } | null = null;
  /** Borda direita do botão no momento da abertura, para manter o alinhamento ao redimensionar. */
  private anchorRight = 0;

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
    if (this.aberto()) {
      this.fechar();
      return;
    }

    const rect = (this.elRef.nativeElement as HTMLElement).getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUp = spaceBelow < DROPDOWN_ESTIMATED_H && spaceAbove > spaceBelow;

    this.anchorRight = rect.right;

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
        left: Math.max(VIEWPORT_MARGIN, rect.right - DROPDOWN_DEFAULT_W), // alinha pela direita do botão
        openUp: shouldOpenUp,
      });
    }
    this.aberto.set(true);
  }

  /** Fecha o dropdown e descarta o tamanho ajustado — sempre reabre no padrão. */
  private fechar(): void {
    this.aberto.set(false);
    this.resizeBase = null;
    this.tamanho.set(null);
  }

  protected iniciarResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    const dropdown = handle.parentElement;
    if (!dropdown) return;
    const rect = dropdown.getBoundingClientRect();
    this.resizeBase = { x: event.clientX, y: event.clientY, w: rect.width, h: rect.height };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  protected moverResize(event: PointerEvent): void {
    const base = this.resizeBase;
    if (!base) return;
    const pos = this.fixedPos();
    // Handle fica no lado oposto à âncora: esquerda (não-sidebar) cresce p/ esquerda,
    // direita (sidebar) cresce p/ direita; topo (open-up) cresce p/ cima.
    const dw = this.sidebar() ? event.clientX - base.x : base.x - event.clientX;
    const dh = pos?.openUp ? base.y - event.clientY : event.clientY - base.y;
    const novo = this.clampTamanho({ w: base.w + dw, h: base.h + dh });
    this.tamanho.set(novo);

    // Mantém a borda direita alinhada ao botão enquanto a largura muda
    if (!this.sidebar() && pos) {
      this.fixedPos.set({ ...pos, left: Math.max(VIEWPORT_MARGIN, this.anchorRight - novo.w) });
    }
  }

  protected finalizarResize(): void {
    this.resizeBase = null;
  }

  protected resetarTamanho(): void {
    this.resizeBase = null;
    this.tamanho.set(null);
    const pos = this.fixedPos();
    if (!this.sidebar() && pos) {
      this.fixedPos.set({ ...pos, left: Math.max(VIEWPORT_MARGIN, this.anchorRight - DROPDOWN_DEFAULT_W) });
    }
  }

  private clampTamanho(t: DropdownTamanho): DropdownTamanho {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const pos = this.fixedPos();

    // Largura: não pode estourar o viewport; no modo sidebar a borda esquerda é fixa
    let maxW = vw - VIEWPORT_MARGIN * 2;
    if (pos && this.sidebar()) {
      maxW = vw - pos.left - VIEWPORT_MARGIN;
    }

    // Altura: limitada pelo espaço disponível na direção de abertura
    let maxH = vh - VIEWPORT_MARGIN * 2;
    if (pos) {
      maxH = pos.openUp
        ? pos.top - DROPDOWN_GAP - VIEWPORT_MARGIN
        : vh - pos.top - VIEWPORT_MARGIN;
    }

    return {
      w: Math.round(Math.min(Math.max(t.w, DROPDOWN_MIN_W), Math.max(maxW, DROPDOWN_MIN_W))),
      h: Math.round(Math.min(Math.max(t.h, DROPDOWN_MIN_H), Math.max(maxH, DROPDOWN_MIN_H))),
    };
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
    if (this.aberto() && !target.closest('app-notificacoes-sino')) {
      this.fechar();
    }
  }
}
