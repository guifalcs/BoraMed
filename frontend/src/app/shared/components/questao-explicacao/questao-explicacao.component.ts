import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';
import {
  parseExplicacaoEstruturada,
  type StatusAlternativaExplicacao,
} from './questao-explicacao.parser';

@Component({
  selector: 'app-questao-explicacao',
  standalone: true,
  imports: [MarkdownComponent],
  templateUrl: './questao-explicacao.component.html',
  providers: [provideMarkdown()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoExplicacaoComponent {
  explicacao = input<string | null>(null);
  referencia = input<string | null>(null);

  /** Explicação separada por alternativa, quando o texto segue o padrão "A) … B) …". */
  protected readonly estruturada = computed(() => parseExplicacaoEstruturada(this.explicacao()));

  /** Cor da linha: fundo verde para a correta, vermelho para as incorretas. */
  protected linhaClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'border-emerald-600 bg-emerald-600 text-white';
    if (status === 'incorreta') return 'border-rose-600 bg-rose-600 text-white';
    return 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]';
  }

  /** A letra fica num círculo branco sobre o fundo colorido. */
  protected chipClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'bg-white text-emerald-700';
    if (status === 'incorreta') return 'bg-white text-rose-700';
    return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
  }
}
