import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UpgradeBadgeComponent } from '../../upgrade-badge/upgrade-badge.component';

export type UiButtonVariant = 'primary' | 'secondary' | 'danger';
export type UiButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'app-ui-button',
  standalone: true,
  imports: [UpgradeBadgeComponent],
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
  /**
   * Recurso pago: apaga o botão e acopla o selo PRO, o mesmo tratamento dos
   * itens bloqueados do menu (materiais/flashcards). Não desabilita — o clique
   * é justamente o que abre o upsell, então o pai continua recebendo o evento.
   */
  bloqueado = input(false);
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
