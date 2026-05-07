import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'danger';
export type UiButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'app-ui-button',
  standalone: true,
  templateUrl: './ui-button.component.html',
  styleUrl: './ui-button.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiButtonComponent {
  label = input.required<string>();
  type = input<UiButtonType>('button');
  variant = input<UiButtonVariant>('primary');
  loading = input(false);
  loadingLabel = input('Carregando...');
  disabled = input(false);
  fullWidth = input(true);
  showArrow = input(false);
  ariaLabel = input<string | null>(null);

  buttonClick = output<MouseEvent>();

  protected handleClick(event: MouseEvent): void {
    if (this.loading() || this.disabled()) {
      event.preventDefault();
      return;
    }

    this.buttonClick.emit(event);
  }
}
