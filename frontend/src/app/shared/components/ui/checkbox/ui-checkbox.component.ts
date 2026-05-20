import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type UiCheckboxVariant = 'default' | 'card';
export type UiCheckboxAlign = 'center' | 'start';

@Component({
  selector: 'app-ui-checkbox',
  standalone: true,
  templateUrl: './ui-checkbox.component.html',
  styleUrl: './ui-checkbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCheckboxComponent {
  checked = input(false);
  disabled = input(false);
  name = input<string | null>(null);
  value = input<string | null>(null);
  ariaLabel = input<string | null>(null);
  variant = input<UiCheckboxVariant>('default');
  align = input<UiCheckboxAlign>('center');
  compact = input(false);

  checkedChange = output<boolean>();

  protected handleChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.checkedChange.emit(inputElement.checked);
  }
}
