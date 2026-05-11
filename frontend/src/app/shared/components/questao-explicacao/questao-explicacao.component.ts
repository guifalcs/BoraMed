import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-questao-explicacao',
  standalone: true,
  templateUrl: './questao-explicacao.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoExplicacaoComponent {
  explicacao = input.required<string>();
  referencia = input<string | null>(null);
  visivel = input<boolean>(true);
}
