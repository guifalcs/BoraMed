import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Undo2, X } from 'lucide-angular';
import type { Alternativa } from '../../../core/models/alternativa';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { ImagemProtegidaService } from '../../../core/services/imagem-protegida.service';
import { ImagemProtegidaPipe } from '../../pipes/imagem-protegida.pipe';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

export type EstadoAlternativa = 'idle' | 'selecionada' | 'correta' | 'errada' | 'desabilitada';

@Component({
  selector: 'app-alternativa-item',
  standalone: true,
  imports: [AsyncPipe, ImagemProtegidaPipe, UiIconComponent],
  templateUrl: './alternativa-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlternativaItemComponent {
  private readonly imageViewer = inject(ImageViewerService);
  private readonly imagens = inject(ImagemProtegidaService);

  alternativa = input.required<Alternativa>();
  estado = input.required<EstadoAlternativa>();

  /** Aluno riscou esta alternativa para se organizar durante a resolução. */
  eliminada = input<boolean>(false);
  /** Exibe o botão de riscar/restaurar (só durante a resolução). */
  podeEliminar = input<boolean>(false);

  selecionar = output<string>();
  /** Emite o novo estado: true = riscar, false = restaurar. */
  toggleEliminar = output<boolean>();

  protected readonly iconEliminar = X;
  protected readonly iconRestaurar = Undo2;

  /**
   * O risco só vale enquanto a alternativa está em jogo. Com gabarito na tela
   * (correta/errada/desabilitada) ele vira ruído e some sozinho.
   */
  protected readonly riscada = computed(
    () => this.eliminada() && (this.estado() === 'idle' || this.estado() === 'selecionada'),
  );

  protected readonly classes = computed(() => {
    // `select-none`: sem isso o long press no toque abre a alça de seleção de
    // texto do sistema por cima da alternativa.
    const base =
      'group block w-full select-none rounded-lg border p-4 text-left text-sm transition-colors';
    if (this.riscada()) {
      return `${base} border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] cursor-default`;
    }
    const map: Record<EstadoAlternativa, string> = {
      idle: 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-primary-light)] cursor-pointer',
      selecionada:
        'border-[var(--color-primary)] bg-blue-50 cursor-pointer',
      correta:
        'border-[var(--color-success)] bg-emerald-50 text-[var(--color-success)] cursor-default',
      errada:
        'border-[var(--color-danger)] bg-red-50 text-[var(--color-danger)] cursor-default',
      desabilitada:
        'border-[var(--color-border)] bg-[var(--color-surface-2)] opacity-60 cursor-not-allowed',
    };
    return `${base} ${map[this.estado()]}`;
  });

  protected readonly letraClasses = computed(() => {
    const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold';
    if (this.riscada()) {
      return `${base} bg-transparent text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]`;
    }
    const map: Record<EstadoAlternativa, string> = {
      idle: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
      selecionada: 'bg-[var(--color-primary)] text-white',
      correta: 'bg-[var(--color-success)] text-white',
      errada: 'bg-[var(--color-danger)] text-white',
      desabilitada: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
    };
    return `${base} ${map[this.estado()]}`;
  });

  /**
   * O X só existe no hover/foco da alternativa — em repouso a lista fica
   * idêntica ao que era antes da feature. Riscada, o botão de restaurar fica
   * visível o tempo todo: é o único caminho de volta.
   */
  protected readonly botaoEliminarClasses = computed(() => {
    const base =
      '-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]';
    if (this.riscada()) return `${base} opacity-100`;
    return `${base} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100`;
  });

  protected readonly rotuloEliminar = computed(() =>
    this.riscada()
      ? `Restaurar alternativa ${this.alternativa().letra}`
      : `Eliminar alternativa ${this.alternativa().letra}`,
  );

  /** O tooltip aproveita para ensinar o atalho, que é invisível na tela. */
  protected readonly dicaEliminar = computed(
    () => `${this.rotuloEliminar()} (Shift + ${this.alternativa().letra})`,
  );

  // ---- Long press (toque) ----
  //
  // No celular não existe hover, então o `X` nunca apareceria: segurar a
  // alternativa por meio segundo risca/restaura. Toque curto segue marcando.

  private static readonly LONG_PRESS_MS = 500;
  /** Acima disso o dedo está rolando a página, não segurando a alternativa. */
  private static readonly TOLERANCIA_MOVIMENTO_PX = 10;

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressOrigem: { x: number; y: number } | null = null;
  /** O long press já agiu: o `click` e o menu de contexto que vêm depois são descartados. */
  private longPressDisparado = false;

  protected onPointerDown(event: PointerEvent): void {
    // No mouse o botão do canto já resolve — long press ali só atrapalharia.
    if (event.pointerType === 'mouse' || !this.podeEliminar()) return;
    this.cancelarLongPress();
    this.longPressDisparado = false;
    this.longPressOrigem = { x: event.clientX, y: event.clientY };
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.longPressDisparado = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
      this.toggleEliminar.emit(!this.riscada());
    }, AlternativaItemComponent.LONG_PRESS_MS);
  }

  protected onPointerMove(event: PointerEvent): void {
    const origem = this.longPressOrigem;
    if (!origem || this.longPressTimer === null) return;
    const tolerancia = AlternativaItemComponent.TOLERANCIA_MOVIMENTO_PX;
    if (
      Math.abs(event.clientX - origem.x) > tolerancia ||
      Math.abs(event.clientY - origem.y) > tolerancia
    ) {
      this.cancelarLongPress();
    }
  }

  /** Só derruba o timer: o `longPressDisparado` tem que sobreviver até o click. */
  protected cancelarLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressOrigem = null;
  }

  protected onContextMenu(event: Event): void {
    if (this.longPressDisparado) event.preventDefault();
  }

  protected handleClick(): void {
    // O click que fecha o long press não pode marcar a alternativa.
    if (this.longPressDisparado) {
      this.longPressDisparado = false;
      return;
    }
    if (this.riscada()) return;
    if (this.estado() === 'idle' || this.estado() === 'selecionada') {
      this.selecionar.emit(this.alternativa().id);
    }
  }

  protected onToggleEliminar(event: Event): void {
    // O clique no botão não pode selecionar a alternativa por tabela.
    event.stopPropagation();
    this.toggleEliminar.emit(!this.riscada());
  }

  protected async abrirImagem(event: Event): Promise<void> {
    // Não pode selecionar a alternativa junto: clique na imagem só amplia.
    event.stopPropagation();
    const url = this.alternativa().imagem_url;
    if (!url) return;
    // O bucket é privado: o viewer precisa da URL assinada, não da armazenada.
    const assinada = await this.imagens.resolver(url);
    if (assinada) this.imageViewer.abrir(assinada);
  }
}
