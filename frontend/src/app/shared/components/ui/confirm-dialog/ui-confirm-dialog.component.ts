import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { UiButtonComponent } from '../button/ui-button.component';

@Component({
  selector: 'app-ui-confirm-dialog',
  standalone: true,
  imports: [UiButtonComponent],
  templateUrl: './ui-confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiConfirmDialogComponent {
  titulo = input.required<string>();
  mensagem = input.required<string>();
  labelConfirmar = input('Confirmar');
  labelCancelar = input('Cancelar');
  variante = input<'primary' | 'danger'>('primary');

  confirmar = output<void>();
  cancelar = output<void>();

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.cancelar.emit();
  }
}
