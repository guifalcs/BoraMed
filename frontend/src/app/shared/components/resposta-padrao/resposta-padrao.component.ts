import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';

/**
 * Card da resposta modelo de uma questão discursiva, exibido após o aluno
 * responder (estudo) ou na revisão/resultado. Sempre visível mesmo sem IA.
 */
@Component({
  selector: 'app-resposta-padrao',
  standalone: true,
  imports: [MarkdownComponent],
  templateUrl: './resposta-padrao.component.html',
  providers: [provideMarkdown()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RespostaPadraoComponent {
  respostaModelo = input<string | null>(null);
  pontosChave = input<string[]>([]);

  protected readonly temConteudo = computed(
    () => !!this.respostaModelo() || this.pontosChave().length > 0,
  );
}
