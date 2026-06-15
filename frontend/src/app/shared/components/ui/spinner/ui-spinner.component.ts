import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiSpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-ui-spinner',
  standalone: true,
  templateUrl: './ui-spinner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSpinnerComponent {
  /** Diâmetro do spinner. */
  readonly size = input<UiSpinnerSize>('md');
  /** Texto opcional exibido abaixo do spinner; também vira rótulo acessível. */
  readonly label = input<string>('');
  /** Quando true (padrão), centraliza num bloco com respiro vertical. Quando false, renderiza inline. */
  readonly centered = input(true);

  protected readonly circleClass = computed(() => {
    switch (this.size()) {
      case 'sm':
        return 'h-4 w-4 border-2';
      case 'lg':
        return 'h-10 w-10 border-[3px]';
      default:
        return 'h-7 w-7 border-2';
    }
  });

  protected readonly ariaLabel = computed(() => this.label() || 'Carregando');
}
