import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Eraser, Highlighter, Trash2 } from 'lucide-angular';
import { FocoModoService } from '../../../core/services/foco-modo.service';
import { GrifoService } from '../../../core/services/grifo.service';
import type { CorGrifo, FerramentaGrifo } from '../../utils/grifo';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

interface OpcaoCor {
  readonly cor: CorGrifo;
  readonly rotulo: string;
  /** Cor sólida do botão da paleta (a pintura do texto vive no styles.css). */
  readonly amostra: string;
}

const OPCOES: readonly OpcaoCor[] = [
  { cor: 'amarelo', rotulo: 'Amarelo', amostra: '#fde047' },
  { cor: 'verde', rotulo: 'Verde', amostra: '#86efac' },
  { cor: 'azul', rotulo: 'Azul', amostra: '#93c5fd' },
  { cor: 'rosa', rotulo: 'Rosa', amostra: '#f9a8d4' },
];

/**
 * Estojo de marca-texto flutuante da prova.
 *
 * Fechado é só um botão; aberto vira a paleta. O modo precisa ser explícito
 * porque no celular a seleção de texto disputa o gesto com o long press que
 * risca alternativa — com o marca-texto na mão, quem manda é a seleção.
 */
@Component({
  selector: 'app-grifo-toolbar',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './grifo-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrifoToolbarComponent {
  private readonly grifo = inject(GrifoService);
  private readonly foco = inject(FocoModoService);

  /** Questão na tela, alvo do botão de limpar. */
  questaoId = input<string | null>(null);

  protected readonly opcoes = OPCOES;
  protected readonly iconGrifar = Highlighter;
  protected readonly iconBorracha = Eraser;
  protected readonly iconLimpar = Trash2;

  protected readonly ativo = this.grifo.modoAtivo;
  protected readonly ferramenta = this.grifo.ferramenta;

  protected readonly dica = computed(() =>
    this.ferramenta() === 'borracha'
      ? 'Selecione o trecho para apagar o grifo'
      : 'Selecione o trecho para grifar',
  );

  protected readonly temGrifosNaQuestao = computed(() => {
    const id = this.questaoId();
    if (!id) return false;
    return (this.grifo.grifos().get(id)?.length ?? 0) > 0;
  });

  /** Fechado, o botão mostra a cor que vai sair — como olhar a ponta da caneta. */
  protected readonly corDoBotao = computed(() => {
    const atual = this.grifo.corAtual();
    return OPCOES.find((o) => o.cor === atual)?.amostra ?? OPCOES[0]!.amostra;
  });

  /**
   * O dock empilha em cima da aba do widget de suporte, no mesmo canto — os
   * dois são flutuantes e disputariam a mesma faixa lado a lado.
   *
   * A altura sai da posição do suporte, que muda de breakpoint sozinho:
   * `bottom: 2rem` (≈2.75rem de altura) no desktop e `bottom: 5.5rem` até
   * 480px, onde ele já sobe para escapar da barra de navegação de 64px. Os
   * 5,5rem do desktop também passam por cima dessa barra na faixa de 481px a
   * 767px, em que ela existe e o suporte ainda está lá embaixo. No modo foco
   * suporte e barra somem, e o dock desce para o rodapé.
   */
  protected readonly classesDock = computed(() => {
    // Classes escritas por extenso: o JIT do Tailwind varre o fonte, então
    // classe montada por interpolação não seria gerada no CSS final.
    const base =
      'pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-end gap-2 px-3';
    return this.foco.ativo()
      ? `${base} pb-[calc(1rem+env(safe-area-inset-bottom))]`
      : `${base} pb-[calc(5.5rem+env(safe-area-inset-bottom))] max-[480px]:pb-[calc(9rem+env(safe-area-inset-bottom))]`;
  });

  protected readonly classesToggle = computed(() => {
    const base = 'flex h-9 w-9 items-center justify-center rounded-full transition-colors';
    return this.ativo()
      ? `${base} text-[var(--color-text)] shadow-inner`
      : `${base} bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]`;
  });

  protected classesFerramenta(selecionada: boolean): string {
    const base = 'flex h-9 w-9 items-center justify-center rounded-full transition-colors';
    return selecionada
      ? `${base} bg-[var(--color-surface-2)] text-[var(--color-text)] ring-2 ring-[var(--color-text)]`
      : `${base} text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]`;
  }

  protected classesAmostra(cor: CorGrifo): string {
    const base = 'block h-6 w-6 rounded-full transition-transform';
    return this.ferramenta() === cor
      ? `${base} scale-110 ring-2 ring-[var(--color-text)] ring-offset-1`
      : `${base} ring-1 ring-black/10 hover:scale-105`;
  }

  protected toggle(): void {
    this.grifo.toggleModo();
  }

  protected escolher(ferramenta: FerramentaGrifo): void {
    // Clicar na ferramenta já em uso guarda o marca-texto de volta no estojo.
    if (this.grifo.modoAtivo() && this.grifo.ferramenta() === ferramenta) {
      this.grifo.modoAtivo.set(false);
      return;
    }
    this.grifo.selecionarFerramenta(ferramenta);
  }

  protected limparQuestao(): void {
    const id = this.questaoId();
    if (id) this.grifo.limparQuestao(id);
  }
}
