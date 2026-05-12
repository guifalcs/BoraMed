import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-questao-explicacao',
  standalone: true,
  imports: [MarkdownComponent],
  templateUrl: './questao-explicacao.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoExplicacaoComponent {
  explicacao = input<string | null>(null);
  referencia = input<string | null>(null);
}
