import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type SkeletonVariant = 'text' | 'card' | 'kpi' | 'row';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `
    @switch (variant()) {
      @case ('kpi') {
        <div class="h-28 animate-pulse rounded-xl bg-[var(--color-surface-2)]"></div>
      }
      @case ('card') {
        <div class="animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div class="h-4 w-3/4 rounded bg-[var(--color-surface-2)]"></div>
          <div class="mt-3 h-3 w-full rounded bg-[var(--color-surface-2)]"></div>
          <div class="mt-2 h-3 w-2/3 rounded bg-[var(--color-surface-2)]"></div>
        </div>
      }
      @case ('row') {
        <div class="flex animate-pulse items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div class="h-9 w-9 shrink-0 rounded-xl bg-[var(--color-surface-2)]"></div>
          <div class="flex-1 space-y-2">
            <div class="h-3 w-1/2 rounded bg-[var(--color-surface-2)]"></div>
            <div class="h-2.5 w-3/4 rounded bg-[var(--color-surface-2)]"></div>
          </div>
        </div>
      }
      @default {
        <div class="h-4 animate-pulse rounded bg-[var(--color-surface-2)]" [class]="widthClass()"></div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text');
  readonly widthClass = input<string>('w-full');
}
