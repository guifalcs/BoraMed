import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Alternativa } from '../../../core/models/alternativa';

export type EstadoAlternativa = 'idle' | 'selecionada' | 'correta' | 'errada' | 'desabilitada';

@Component({
  selector: 'app-alternativa-item',
  standalone: true,
  templateUrl: './alternativa-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlternativaItemComponent {
  alternativa = input.required<Alternativa>();
  estado = input.required<EstadoAlternativa>();

  selecionar = output<string>();

  protected readonly classes = computed(() => {
    const base =
      'flex items-start gap-3 w-full rounded-lg border p-4 text-left text-sm transition-colors';
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
}
