import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { Alternativa } from '../../../core/models/alternativa';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { ImagemProtegidaService } from '../../../core/services/imagem-protegida.service';
import { ImagemProtegidaPipe } from '../../pipes/imagem-protegida.pipe';

export type EstadoAlternativa = 'idle' | 'selecionada' | 'correta' | 'errada' | 'desabilitada';

@Component({
  selector: 'app-alternativa-item',
  standalone: true,
  imports: [AsyncPipe, ImagemProtegidaPipe],
  templateUrl: './alternativa-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlternativaItemComponent {
  private readonly imageViewer = inject(ImageViewerService);
  private readonly imagens = inject(ImagemProtegidaService);

  alternativa = input.required<Alternativa>();
  estado = input.required<EstadoAlternativa>();

  selecionar = output<string>();

  protected readonly classes = computed(() => {
    const base = 'block w-full rounded-lg border p-4 text-left text-sm transition-colors';
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
    const map: Record<EstadoAlternativa, string> = {
      idle: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
      selecionada: 'bg-[var(--color-primary)] text-white',
      correta: 'bg-[var(--color-success)] text-white',
      errada: 'bg-[var(--color-danger)] text-white',
      desabilitada: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
    };
    return `${base} ${map[this.estado()]}`;
  });

  protected handleClick(): void {
    if (this.estado() === 'idle' || this.estado() === 'selecionada') {
      this.selecionar.emit(this.alternativa().id);
    }
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
