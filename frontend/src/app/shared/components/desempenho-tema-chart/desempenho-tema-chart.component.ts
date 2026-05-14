import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DesempenhoTema } from '../../../core/models/historico';

@Component({
  selector: 'app-desempenho-tema-chart',
  standalone: true,
  templateUrl: './desempenho-tema-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesempenhoTemaChartComponent {
  temas = input.required<DesempenhoTema[]>();

  protected barClass(taxa: number): string {
    if (taxa >= 70) return 'bg-emerald-500';
    if (taxa >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  }

  protected taxaClass(taxa: number): string {
    if (taxa >= 70) return 'text-emerald-700 font-bold';
    if (taxa >= 50) return 'text-amber-700 font-bold';
    return 'text-red-700 font-bold';
  }
}
