import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { ResultadoTentativa } from '../../../core/models/tentativa';
import { UiButtonComponent } from '../ui/button/ui-button.component';

@Component({
  selector: 'app-resultado-summary',
  standalone: true,
  imports: [UiButtonComponent, DecimalPipe],
  templateUrl: './resultado-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadoSummaryComponent {
  resultado = input.required<ResultadoTentativa>();

  voltar = output<void>();
  refazer = output<void>();

  protected readonly nota = computed(() => this.resultado().tentativa.nota ?? 0);

  protected readonly notaClass = computed(() => {
    const n = this.nota();
    if (n >= 70) return 'text-[var(--color-success)]';
    if (n >= 50) return 'text-[var(--color-warning)]';
    return 'text-[var(--color-danger)]';
  });

  protected readonly notaMensagem = computed(() => {
    const n = this.nota();
    if (n >= 70) return 'Ótimo desempenho!';
    if (n >= 50) return 'Desempenho razoável. Continue praticando.';
    return 'Precisa de mais prática. Revise os conteúdos.';
  });

  protected readonly acertos = computed(() => this.resultado().tentativa.acertos);
  protected readonly total = computed(() => this.resultado().tentativa.total_questoes);
}
