import { Directive, input, TemplateRef, inject } from '@angular/core';

@Directive({
  selector: '[appDataTableColumn]',
  standalone: true,
})
export class DataTableColumnDirective<T> {
  appDataTableColumn = input.required<string>();
  header = input<string>('');
  sortable = input<boolean>(false);

  readonly templateRef = inject(TemplateRef<DataTableCellContext<T>>);
}

export interface DataTableCellContext<T> {
  $implicit: unknown;
  row: T;
  index: number;
}
