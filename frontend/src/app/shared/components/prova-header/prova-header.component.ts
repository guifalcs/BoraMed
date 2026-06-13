import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ArrowLeft, Flag, Maximize2, Minimize2, Pause, Play } from 'lucide-angular';
import type { ModoProva } from '../../../core/models/tentativa';
import { TimerComponent } from '../timer/timer.component';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-prova-header',
  standalone: true,
  imports: [TimerComponent, UiIconComponent],
  templateUrl: './prova-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaHeaderComponent {
  titulo = input.required<string>();
  totalQuestoes = input.required<number>();
  totalRespondidas = input.required<number>();
  segundos = input.required<number>();
  modo = input.required<ModoProva>();
  isPaused = input<boolean>(false);
  salvando = input<boolean>(false);
  focoAtivo = input<boolean>(false);

  finalizar = output<void>();
  togglePausar = output<void>();
  sair = output<void>();
  toggleFoco = output<void>();

  protected readonly pauseIcon = Pause;
  protected readonly playIcon = Play;
  protected readonly arrowLeftIcon = ArrowLeft;
  protected readonly flagIcon = Flag;
  protected readonly expandIcon = Maximize2;
  protected readonly shrinkIcon = Minimize2;

  protected readonly progressoPercent = computed(() =>
    this.totalQuestoes() > 0
      ? Math.round((this.totalRespondidas() / this.totalQuestoes()) * 100)
      : 0,
  );

  protected readonly exibirTimer = computed(() => this.modo() !== 'visualizar');
  protected readonly exibirPausar = computed(() => this.modo() === 'simulado' || this.modo() === 'estudo');

  protected readonly naoRespondidas = computed(() =>
    this.totalQuestoes() - this.totalRespondidas(),
  );
}
