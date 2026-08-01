import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Lock } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

export type UpgradeBadgeVariante = 'solido' | 'suave' | 'contorno';

/**
 * Selo de recurso pago. Marca no menu e nos cards o que existe mas está
 * bloqueado: esconder o recurso esconde também o motivo para assinar.
 */
@Component({
  selector: 'app-upgrade-badge',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './upgrade-badge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeBadgeComponent {
  label = input('PRO');
  variante = input<UpgradeBadgeVariante>('suave');
  comIcone = input(true);

  protected readonly lockIcon = Lock;

  protected readonly classes = computed(() => {
    const base =
      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide leading-none';
    switch (this.variante()) {
      case 'solido':
        return `${base} bg-[var(--color-action)] text-white`;
      case 'contorno':
        return `${base} border border-white/40 text-white`;
      default:
        return `${base} bg-amber-100 text-amber-800`;
    }
  });
}
