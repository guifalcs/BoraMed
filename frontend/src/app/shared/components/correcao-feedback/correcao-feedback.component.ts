import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Check, CircleAlert, RefreshCw, X } from 'lucide-angular';
import type { RespostaCorrecao } from '../../../core/models/correcao';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

/**
 * Feedback da correção por IA de uma resposta aberta: badge de nota 0–100
 * (thresholds 70/50 do app), checklist de pontos atendidos/faltantes,
 * comentário e erros apontados. Cobre também os estados `corrigindo`
 * (spinner), `erro` (botão tentar de novo) e `sem_ia` (não conta na nota).
 */
@Component({
  selector: 'app-correcao-feedback',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './correcao-feedback.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CorrecaoFeedbackComponent {
  correcao = input.required<RespostaCorrecao>();

  /** Pedido de nova tentativa de correção (estado `erro`). */
  tentarNovamente = output<void>();

  protected readonly checkIcon = Check;
  protected readonly xIcon = X;
  protected readonly alertIcon = CircleAlert;
  protected readonly retryIcon = RefreshCw;

  protected readonly notaClasse = computed(() => {
    const pontos = this.correcao().pontos ?? 0;
    if (pontos >= 70) return 'bg-emerald-100 text-emerald-800';
    if (pontos >= 50) return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-800';
  });

  protected readonly pontosAtendidos = computed(() => this.correcao().pontos_atendidos ?? []);
  protected readonly pontosFaltantes = computed(() => this.correcao().pontos_faltantes ?? []);
  protected readonly erros = computed(() => this.correcao().erros ?? []);
}
