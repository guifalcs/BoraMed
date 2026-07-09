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

  protected statusLabel(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'Correta';
    if (status === 'incorreta') return 'Incorreta';
    return '';
  }

  protected linhaClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'border-emerald-200 bg-emerald-50';
    if (status === 'incorreta') return 'border-[var(--color-border)] bg-[var(--color-surface)]';
    return 'border-[var(--color-border)] bg-[var(--color-surface)]';
  }

  protected chipClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'bg-emerald-600 text-white';
    if (status === 'incorreta') return 'bg-rose-100 text-rose-600';
    return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
  }

  protected labelClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'text-emerald-700';
    if (status === 'incorreta') return 'text-rose-600';
    return 'text-[var(--color-text-muted)]';
  }
}
