import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Trophy } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-ranking-status-bar',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './ranking-status-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankingStatusBarComponent {
  posicaoGlobal = input<number | null>(null);
  posicaoSemana = input<number | null>(null);
  xpSemana = input<number>(0);
  competirPublico = input<boolean>(true);

  protected readonly trophyIcon = Trophy;

  protected readonly statusText = computed(() => {
    const posicao = this.posicaoGlobal();
    const xpSemana = formatNumber(this.xpSemana());
    const privacidade = this.competirPublico() ? '' : ' · você aparece como anônimo';

    if (posicao !== null) {
      return `Você está em #${posicao} no ranking · ${xpSemana} XP esta semana${privacidade}`;
    }

    return `Finalize um simulado para entrar no ranking · ${xpSemana} XP esta semana${privacidade}`;
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}
