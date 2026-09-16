import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { UiButtonComponent } from '../button/ui-button.component';

@Component({
  selector: 'app-ui-confirm-dialog',
  standalone: true,
  imports: [UiButtonComponent],
  templateUrl: './ui-confirm-dialog.component.html',
  styleUrl: './ui-confirm-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiConfirmDialogComponent implements AfterViewInit {
  titulo = input.required<string>();
  mensagem = input.required<string>();
  labelConfirmar = input('Confirmar');
  labelCancelar = input('Cancelar');
  variante = input<'primary' | 'danger'>('primary');

  confirmar = output<void>();
  cancelar = output<void>();

  private readonly caixa = viewChild.required<ElementRef<HTMLDialogElement>>('caixa');
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngAfterViewInit(): void {
    // `showModal` é o que joga o diálogo na top layer e traz o `::backdrop`
    // junto. Sem ele o elemento seria só um bloco escondido na página.
    if (this.isBrowser) this.caixa().nativeElement.showModal();
  }

  /**
   * Esc fecha pelo navegador. Quem tira o componente da tela é o pai, pelo
   * `cancelar` — por isso o fechamento nativo é barrado aqui, senão a caixa
   * sumiria mas o `@if` do pai continuaria aberto.
   */
  protected aoCancelarNativo(evento: Event): void {
    evento.preventDefault();
    this.cancelar.emit();
  }

  /** Clique no escurecido chega com o alvo sendo o próprio `<dialog>`. */
  protected aoClicarNoFundo(evento: MouseEvent): void {
    if (evento.target === this.caixa().nativeElement) this.cancelar.emit();
  }
}
