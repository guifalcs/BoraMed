import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Prova, SubtipoProva } from '../../../core/models/prova';

export type ProvaCardVariant = 'card' | 'row';

const SUBTIPO_LABEL: Record<SubtipoProva, string> = {
  N1: 'N1',
  teste_progresso: 'TPI',
  N2: 'N2',
  P1: 'P1',
  P2: 'P2',
};

const SUBTIPO_LABEL_FULL: Record<SubtipoProva, string> = {
  N1: 'N1',
  teste_progresso: 'TPI',
  N2: 'Integradora',
  P1: 'P1',
  P2: 'P2',
};

@Component({
  selector: 'app-prova-card',
  standalone: true,
  templateUrl: './prova-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaCardComponent {
  prova = input.required<Prova>();
  variant = input<ProvaCardVariant>('card');

  abrirProva = output<string>();

  protected readonly subtipoLabel = computed(() => {
    const s = this.prova().subtipo ?? this.prova().subtipo_nacional;
    return s ? SUBTIPO_LABEL[s] : null;
  });

  protected readonly subtipoLabelFull = computed(() => {
    const s = this.prova().subtipo ?? this.prova().subtipo_nacional;
    return s ? SUBTIPO_LABEL_FULL[s] : null;
  });

  protected readonly badgeClass = computed(() => {
    const s = this.prova().subtipo ?? this.prova().subtipo_nacional;
    if (s === 'N1') return 'bg-blue-100 text-blue-700';
    if (s === 'teste_progresso') return 'bg-violet-100 text-violet-700';
    if (s === 'N2') return 'bg-teal-100 text-teal-700';
    if (s === 'P1') return 'bg-cyan-100 text-cyan-700';
    if (s === 'P2') return 'bg-emerald-100 text-emerald-700';
    return 'bg-gray-100 text-gray-600';
  });
}
