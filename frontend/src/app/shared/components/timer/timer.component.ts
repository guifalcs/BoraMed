import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-timer',
  standalone: true,
  templateUrl: './timer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimerComponent {
  seconds = input.required<number>();
  warnAt = input<number>(300);
  dangerAt = input<number>(60);

  protected readonly formatted = computed(() => {
    const total = this.seconds();
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  });

  protected readonly colorClass = computed(() => {
    const s = this.seconds();
    if (s <= this.dangerAt()) return 'text-[var(--color-danger)] font-bold animate-pulse';
    if (s <= this.warnAt()) return 'text-[var(--color-warning)] font-semibold';
    return 'text-[var(--color-text-muted)]';
  });
}
