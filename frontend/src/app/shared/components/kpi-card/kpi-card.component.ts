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
  sparkline = input<number[]>([]);

  protected readonly sparklinePath = computed(() => {
    const pts = this.sparkline();
    if (pts.length < 2) return null;
    const max = Math.max(...pts);
    const min = Math.min(...pts);
    const range = max - min || 1;
    const w = 80;
    const h = 24;
    const step = w / (pts.length - 1);
    const coords = pts.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`);
    return { polyline: coords.join(' '), w, h };
  });

  protected readonly sparklineColor = computed(() => {
    const pts = this.sparkline();
    if (pts.length < 2) return '#6366f1';
    return pts[pts.length - 1] >= pts[0] ? '#10b981' : '#ef4444';
  });

  protected readonly acentoClass = computed(() => {
    switch (this.variante()) {
      case 'success': return 'bg-emerald-400';
      case 'warning': return 'bg-amber-400';
      case 'danger':  return 'bg-red-400';
      default:        return 'bg-[var(--color-primary-light)]';
    }
  });

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
