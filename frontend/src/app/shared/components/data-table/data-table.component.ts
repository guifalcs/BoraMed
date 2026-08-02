import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataTableColumnDirective } from './data-table-column.directive';
import { NgTemplateOutlet } from '@angular/common';

export interface DataTableColumn {
  key: string;
  header: string;
  sortable?: boolean;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T extends object> {
  constructor() {
    effect(() => {
      const totalPages = this.totalPages();
      const page = Math.max(1, Math.min(this.currentPage(), totalPages));
      if (page !== this.currentPage()) this.currentPage.set(page);
    });
  }

  /** Column definitions (used when no ng-template columns are projected) */
  columns = input<DataTableColumn[]>([]);

  /** All data rows */
  data = input.required<T[]>();

  /** Enable text filter */
  filterable = input<boolean>(false);

  /** Placeholder for the filter input */
  filterPlaceholder = input<string>('Buscar...');

  /** Keys to search when filtering (defaults to all columns) */
  filterKeys = input<string[]>([]);

  /** Enable pagination */
  paginated = input<boolean>(false);

  /** Rows per page */
  pageSize = input<number>(10);

  /** Whether rows are clickable */
  clickable = input<boolean>(false);

  /** Emits the clicked row */
  rowClick = output<T>();

  /** Current page (1-based) */
  currentPage = model<number>(1);

  /** Internal filter text */
  protected readonly filterText = signal('');

  /** Internal sort state */
  protected readonly sortState = signal<SortState>({ column: null, direction: null });

  /** Projected column templates */
  protected readonly columnTemplates = contentChildren(DataTableColumnDirective);

  /** Resolved columns: from templates or from input */
  protected readonly resolvedColumns = computed<DataTableColumn[]>(() => {
    const templates = this.columnTemplates();
    if (templates.length > 0) {
      return templates.map(t => ({
        key: t.appDataTableColumn(),
        header: t.header() || t.appDataTableColumn(),
        sortable: t.sortable(),
      }));
    }
    return this.columns();
  });

  /** Data after filtering */
  protected readonly filteredData = computed<T[]>(() => {
    const raw = this.data();
    const text = this.filterText().toLowerCase().trim();
    if (!text) return raw;

    const keys = this.filterKeys().length > 0
      ? this.filterKeys()
      : this.resolvedColumns().map(c => c.key);

    return raw.filter(row =>
      keys.some(k => {
        const val = (row as Record<string, unknown>)[k];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(text);
      })
    );
  });

  /** Data after sorting */
  protected readonly sortedData = computed<T[]>(() => {
    const data = [...this.filteredData()];
    const { column, direction } = this.sortState();
    if (!column || !direction) return data;

    return data.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[column];
      const bVal = (b as Record<string, unknown>)[column];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = String(aVal).localeCompare(String(bVal), 'pt-BR', { numeric: true });
      return direction === 'asc' ? comparison : -comparison;
    });
  });

  /** Total pages */
  protected readonly totalPages = computed(() => {
    if (!this.paginated()) return 1;
    return Math.max(1, Math.ceil(this.sortedData().length / Math.max(1, this.pageSize())));
  });

  protected readonly effectivePage = computed(() =>
    Math.max(1, Math.min(this.currentPage(), this.totalPages())),
  );

  /** Paginated data slice */
  protected readonly paginatedData = computed<T[]>(() => {
    const sorted = this.sortedData();
    if (!this.paginated()) return sorted;

    const size = Math.max(1, this.pageSize());
    const start = (this.effectivePage() - 1) * size;
    return sorted.slice(start, start + size);
  });

  /** Total filtered items count */
  protected readonly totalItems = computed(() => this.filteredData().length);

  /** Range label for pagination */
  protected readonly rangeLabel = computed(() => {
    const total = this.totalItems();
    if (total === 0) return '0 itens';
    const size = Math.max(1, this.pageSize());
    const start = (this.effectivePage() - 1) * size + 1;
    const end = Math.min(this.effectivePage() * size, total);
    return `${start}–${end} de ${total}`;
  });

  protected onFilterChange(value: string): void {
    this.filterText.set(value);
    this.currentPage.set(1);
  }

  protected onSort(column: DataTableColumn): void {
    if (!column.sortable) return;

    const current = this.sortState();
    let direction: SortDirection;

    if (current.column !== column.key) {
      direction = 'asc';
    } else if (current.direction === 'asc') {
      direction = 'desc';
    } else {
      direction = null;
    }

    this.sortState.set({ column: direction ? column.key : null, direction });
    this.currentPage.set(1);
  }

  protected onRowClick(row: T): void {
    if (this.clickable()) {
      this.rowClick.emit(row);
    }
  }

  protected goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  protected getCellValue(row: T, key: string): unknown {
    return (row as Record<string, unknown>)[key];
  }

  protected getColumnTemplate(key: string): DataTableColumnDirective<T> | undefined {
    return this.columnTemplates().find(t => t.appDataTableColumn() === key);
  }

  protected getSortIcon(column: DataTableColumn): string {
    const { column: sortCol, direction } = this.sortState();
    if (sortCol !== column.key || !direction) return '↕';
    return direction === 'asc' ? '↑' : '↓';
  }
}
