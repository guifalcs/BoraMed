import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface SegmentedToggleOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string;
}

@Component({
  selector: 'app-ui-segmented-toggle',
  standalone: true,
  templateUrl: './ui-segmented-toggle.component.html',
  styleUrl: './ui-segmented-toggle.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSegmentedToggleComponent {
  options = input.required<SegmentedToggleOption[]>();
  value = input<string | null>(null);
  ariaLabel = input<string | null>(null);
  disabled = input(false);

  valueChange = output<string>();

  protected readonly selectedIndex = computed(() => {
    const idx = this.options().findIndex((o) => o.value === this.value());
    return idx < 0 ? 0 : idx;
  });

  protected readonly indicatorWidthPct = computed(() => {
    const count = this.options().length;
    return count > 0 ? 100 / count : 100;
  });

  protected select(option: SegmentedToggleOption): void {
    if (this.disabled() || option.value === this.value()) return;
    this.valueChange.emit(option.value);
  }
}
