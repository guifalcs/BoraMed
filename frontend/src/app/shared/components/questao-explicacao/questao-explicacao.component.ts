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

  /**
   * Cor da linha: as mesmas cores suaves usadas na alternativa respondida
   * (estados 'correta'/'errada' do alternativa-item) — verde/vermelho fracos.
   */
  protected linhaClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'border-[var(--color-success)] bg-emerald-50 text-[var(--color-success)]';
    if (status === 'incorreta') return 'border-[var(--color-danger)] bg-red-50 text-[var(--color-danger)]';
    return 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]';
  }

  /** A letra fica num círculo sólido na cor do status, com texto branco. */
  protected chipClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'bg-[var(--color-success)] text-white';
    if (status === 'incorreta') return 'bg-[var(--color-danger)] text-white';
    return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
  }
}
