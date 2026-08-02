import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-admin-pagination',
  standalone: true,
  template: `
    @if (totalPages() > 1) {
      <nav
        class="mt-4 flex w-full flex-col items-center justify-between gap-3 sm:flex-row"
        aria-label="Paginação da tabela"
      >
        <span class="text-xs text-[var(--color-text-muted)]">
          {{ rangeLabel() }}
        </span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            [class]="page() === 0
              ? 'rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors disabled:cursor-not-allowed disabled:opacity-40'
              : 'rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40'"
            [disabled]="page() === 0"
            (click)="changePage(page() - 1)"
          >
            Anterior
          </button>
          <span class="px-3 py-1.5 text-xs font-semibold text-[var(--color-text)]">
            {{ page() + 1 }} / {{ totalPages() }}
          </span>
          <button
            type="button"
            [class]="page() === totalPages() - 1
              ? 'rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors disabled:cursor-not-allowed disabled:opacity-40'
              : 'rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40'"
            [disabled]="page() === totalPages() - 1"
            (click)="changePage(page() + 1)"
          >
            Próxima
          </button>
        </div>
      </nav>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaginationComponent {
  /** Página atual, com índice iniciado em zero. */
  readonly page = input.required<number>();
  /** Total de itens antes do recorte da página. */
  readonly totalItems = input.required<number>();
  /** Quantidade máxima de linhas por página. */
  readonly pageSize = input.required<number>();

  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / Math.max(1, this.pageSize()))),
  );

  protected readonly rangeLabel = computed(() => {
    const total = this.totalItems();
    if (total === 0) return '0 itens';
    const size = Math.max(1, this.pageSize());
    const start = this.page() * size + 1;
    const end = Math.min((this.page() + 1) * size, total);
    return `${start}-${end} de ${total}`;
  });

  protected changePage(page: number): void {
    const bounded = Math.max(0, Math.min(page, this.totalPages() - 1));
    if (bounded !== this.page()) this.pageChange.emit(bounded);
  }
}
