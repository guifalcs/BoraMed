import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Check, CircleAlert, RefreshCw, Sparkles, X } from 'lucide-angular';
import type { RespostaCorrecao } from '../../../core/models/correcao';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { UiInfoTooltipComponent } from '../ui/info-tooltip/ui-info-tooltip.component';

/** Nome/persona da IA corretora do BoraMed. */
export const AGENTE_IA_NOME = 'Aurora';

/**
 * Disclaimer da correção por IA: define expectativa (guia de estudo, não a
 * correção oficial) e reforça a independência em relação à Afya (regra de
 * negócio: menção comparativa sempre acompanhada do disclaimer de independência).
 */
export const AGENTE_IA_DISCLAIMER =
  'A ' +
  AGENTE_IA_NOME +
  ' é um apoio ao seu estudo, não a correção oficial. Ela aponta a direção da resposta e os principais pontos esperados para você treinar — não reproduz os critérios exatos dos professores da Afya. O BoraMed é uma plataforma independente, sem vínculo com a Afya.';

/**
 * Feedback da correção por IA de uma resposta aberta: badge de nota 0–100
 * (thresholds 70/50 do app), checklist de pontos atendidos/faltantes,
 * comentário e erros apontados. Cobre também os estados `corrigindo`
 * (spinner), `erro` (botão tentar de novo) e `sem_ia` (não conta na nota).
 */
@Component({
  selector: 'app-correcao-feedback',
  standalone: true,
  imports: [UiIconComponent, UiInfoTooltipComponent],
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
  protected readonly sparklesIcon = Sparkles;
  protected readonly agenteNome = AGENTE_IA_NOME;
  protected readonly disclaimer = AGENTE_IA_DISCLAIMER;

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
