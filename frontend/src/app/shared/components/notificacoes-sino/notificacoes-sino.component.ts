import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Bell, CheckCheck } from 'lucide-angular';
import { AppNotificacaoService } from '../../../core/services/app-notification.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type { AppNotificacao } from '../../../core/models/app-notification.types';

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

  /** Quando true, o dropdown abre para cima e alinhado à esquerda (uso no sidebar). */
  sidebar = input(false);

  protected readonly aberto = signal(false);
  protected readonly iconBell = Bell;
  protected readonly iconCheck = CheckCheck;
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
    this.aberto.update(v => !v);
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
