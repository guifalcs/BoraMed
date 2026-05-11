import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Pause, X } from 'lucide-angular';
import type { ModoProva } from '../../../core/models/tentativa';
import { TimerComponent } from '../timer/timer.component';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { UiButtonComponent } from '../ui/button/ui-button.component';

@Component({
  selector: 'app-prova-header',
  standalone: true,
  imports: [TimerComponent, UiIconComponent, UiButtonComponent],
  templateUrl: './prova-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaHeaderComponent {
  titulo = input.required<string>();
  totalQuestoes = input.required<number>();
  totalRespondidas = input.required<number>();
  segundos = input.required<number>();
  modo = input.required<ModoProva>();
  salvando = input<boolean>(false);

  finalizar = output<void>();
  pausar = output<void>();

  protected readonly pauseIcon = Pause;
  protected readonly closeIcon = X;

  protected readonly progressoPercent = computed(() =>
    this.totalQuestoes() > 0
      ? Math.round((this.totalRespondidas() / this.totalQuestoes()) * 100)
      : 0,
  );

  protected readonly exibirTimer = computed(() => this.modo() !== 'visualizar');
  protected readonly exibirPausar = computed(() => this.modo() === 'simulado');
}
