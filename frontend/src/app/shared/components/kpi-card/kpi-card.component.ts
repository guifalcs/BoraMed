import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

export type KpiVariante = 'default' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './kpi-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiCardComponent {
  label = input.required<string>();
  valor = input.required<string>();
  sublabel = input<string | null>(null);
  icone = input.required<LucideIconData>();
  variante = input<KpiVariante>('default');

  protected readonly iconeBgClass = computed(() => {
    switch (this.variante()) {
      case 'success': return 'bg-emerald-50 text-emerald-600';
      case 'warning': return 'bg-amber-50 text-amber-600';
      case 'danger':  return 'bg-red-50 text-red-600';
      default:        return 'bg-blue-50 text-blue-600';
    }
  });

  protected readonly valorClass = computed(() => {
    switch (this.variante()) {
      case 'success': return 'text-emerald-600';
      case 'warning': return 'text-amber-600';
      case 'danger':  return 'text-red-600';
      default:        return 'text-[var(--color-primary)]';
    }
  });
}
