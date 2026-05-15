import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { ResultadoTentativa } from '../../../core/models/tentativa';
import { UiButtonComponent } from '../ui/button/ui-button.component';

@Component({
  selector: 'app-resultado-summary',
  standalone: true,
  imports: [UiButtonComponent, DecimalPipe, RouterLink],
  templateUrl: './resultado-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadoSummaryComponent {
  resultado = input.required<ResultadoTentativa>();
  isPersonalizado = input(false);
  backRota = input<string>('/dashboard/simulados');
  backLabel = input<string>('Todos os simulados');
  notaAnterior = input<number | null>(null);

  protected readonly provaId = computed(() => this.resultado().tentativa.prova_id);

  protected readonly nota = computed(() => this.resultado().tentativa.nota ?? 0);

  protected readonly deltaNota = computed(() => {
    const anterior = this.notaAnterior();
    if (anterior === null) return null;
    return Math.round((this.nota() - anterior) * 10) / 10;
  });

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

  protected readonly tempoFormatado = computed(() => {
    const total = this.resultado().tentativa.tempo_acumulado_segundos;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  });

  protected readonly tempoMedioPorQuestao = computed(() => {
    const total = this.resultado().tentativa.tempo_acumulado_segundos;
    const qtd = this.resultado().tentativa.total_questoes;
    if (qtd === 0 || total === 0) return null;
    const media = Math.round(total / qtd);
    const m = Math.floor(media / 60);
    const s = media % 60;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  });
}
