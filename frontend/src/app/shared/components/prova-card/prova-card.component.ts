import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Prova, SubtipoProva } from '../../../core/models/prova';

const SUBTIPO_LABEL: Record<SubtipoProva, string> = {
  N1: 'N1',
  teste_progresso: 'Teste de Progresso',
  N2: 'N2 — Integradora',
};

@Component({
  selector: 'app-prova-card',
  standalone: true,
  templateUrl: './prova-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaCardComponent {
  prova = input.required<Prova>();
  destacar = input<boolean>(false);

  abrirProva = output<string>();

  protected readonly subtipoLabel = computed(() => {
    const s = this.prova().subtipo_nacional;
    return s ? SUBTIPO_LABEL[s] : null;
  });
}
