import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { FiltrosProvas, SubtipoProva } from '../../../core/models/prova';
import { UiSelectComponent } from '../ui/select/ui-select.component';

interface Opcao {
  value: string;
  label: string;
}

@Component({
  selector: 'app-filtros-provas',
  standalone: true,
  imports: [UiSelectComponent],
  templateUrl: './filtros-provas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltrosProvasComponent {
  filtros = input.required<FiltrosProvas>();

  filtrosChange = output<FiltrosProvas>();

  protected readonly subtipoOpcoes: Opcao[] = [
    { value: '', label: 'Todos os subtipos' },
    { value: 'N1', label: 'N1' },
    { value: 'teste_progresso', label: 'TPI' },
    { value: 'N2', label: 'Integradora' },
  ];

  protected readonly periodoOpcoes: Opcao[] = [
    { value: '', label: 'Todos os períodos' },
    ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}º período` })),
  ];

  protected onSubtipoChange(value: string): void {
    this.filtrosChange.emit({
      ...this.filtros(),
      subtipo: (value || null) as SubtipoProva | null,
    });
  }

  protected onPeriodoChange(value: string): void {
    this.filtrosChange.emit({
      ...this.filtros(),
      periodo: value ? Number(value) : null,
    });
  }
}
