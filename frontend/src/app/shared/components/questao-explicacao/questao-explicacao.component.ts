import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';
import {
  parseExplicacaoEstruturada,
  type AlternativaExplicacao,
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
  /**
   * Letras das alternativas corretas (vindas do banco). Quando informadas, o
   * verde é decidido pela letra — não pelo texto — o que permite manter a
   * explicação verbatim (sem precisar do prefixo "Correta"/"Incorreta").
   * Vazio: cai no fallback de detecção pelo texto.
   */
  letrasCorretas = input<string[]>([]);

  /** Explicação separada por alternativa, quando o texto segue o padrão "A) … B) …". */
  protected readonly estruturada = computed(() => parseExplicacaoEstruturada(this.explicacao()));

  /** Status efetivo: pela letra correta do banco quando disponível; senão, pelo texto. */
  protected statusDaAlt(alt: AlternativaExplicacao): StatusAlternativaExplicacao {
    const corretas = this.letrasCorretas();
    if (corretas.length > 0) {
      return corretas.includes(alt.letra) ? 'correta' : 'incorreta';
    }
    return alt.status;
  }

  /**
   * Cor da linha dentro do card único: a correta vira uma faixa verde suave
   * (com traço verde na lateral); as incorretas ficam brancas, texto normal,
   * como se a alternativa não tivesse sido respondida.
   */
  protected linhaClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') {
      return 'bg-emerald-50 text-[var(--color-success)] shadow-[inset_3px_0_0_var(--color-success)]';
    }
    return 'text-[var(--color-text)]';
  }

  /** A letra fica num círculo: verde sólido na correta, neutro nas demais. */
  protected chipClasses(status: StatusAlternativaExplicacao): string {
    if (status === 'correta') return 'bg-[var(--color-success)] text-white';
    return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
  }
}
