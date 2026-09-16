import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Eraser, Highlighter, Trash2 } from 'lucide-angular';
import { FocoModoService } from '../../../core/services/foco-modo.service';
import { GrifoService } from '../../../core/services/grifo.service';
import {
  CORES_PADRAO,
  NOME_DAS_CORES_PADRAO,
  type CorGrifo,
  type FerramentaGrifo,
} from '../../utils/grifo';
import { corDoTextoSobre } from '../../utils/grifo-cor';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

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

  /**
   * Atalhos da paleta. O resto do espectro sai do seletor de cor ao lado —
   * quatro botões cobrem o uso comum sem virar um leque de tinta na tela.
   * A amostra é a própria cor que pinta o texto: o botão prevê o resultado.
   */
  protected readonly cores = CORES_PADRAO;
  /** Cores escolhidas no espectro, à mão sem reabrir o seletor do sistema. */
  protected readonly recentes = this.grifo.recentes;
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
  protected readonly corDoBotao = computed(() => this.grifo.corAtual());

  /**
   * Ícone do botão principal por cima da cor carregada. Com o espectro aberto
   * a cor pode ser escura, e um ícone escuro sumiria dentro dela — o mesmo
   * cálculo que decide a cor do texto grifado decide a do ícone.
   */
  protected readonly corDoIcone = computed(() => corDoTextoSobre(this.corDoBotao()));

  protected rotuloDaCor(cor: CorGrifo): string {
    return NOME_DAS_CORES_PADRAO[cor] ?? cor;
  }

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
    // Guardado, o estojo encosta na borda (sem padding à direita) para poder
    // se esconder nela; aberto, a paleta respira longe do canto.
    // Classes escritas por extenso: o JIT do Tailwind varre o fonte, então
    // classe montada por interpolação não seria gerada no CSS final.
    const lado = this.ativo() ? 'px-3' : 'pl-3 pr-0';
    const base = `pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-end gap-2 ${lado}`;
    return this.foco.ativo()
      ? `${base} pb-[calc(1rem+env(safe-area-inset-bottom))]`
      : `${base} pb-[calc(5.5rem+env(safe-area-inset-bottom))] max-[480px]:pb-[calc(9rem+env(safe-area-inset-bottom))]`;
  });

  /**
   * Fechado, o estojo se esconde na borda como a aba do suporte logo abaixo:
   * encosta na direita, perde o arredondamento desse lado e sai deslizando no
   * hover. Sobra só o suficiente para o ícone aparecer — no toque, onde hover
   * não existe, essa sobra é o alvo do dedo. Aberto, ele vem inteiro para
   * dentro da tela: a paleta não pode ficar meio de fora.
   */
  protected readonly classesBarra = computed(() => {
    const base =
      'pointer-events-auto flex items-center gap-1 border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg transition-transform duration-[650ms] ease-[cubic-bezier(0.65,0,0.35,1)]';
    // Aberta, a paleta tem atalhos + recentes + espectro + borracha + limpar:
    // no celular isso passa da largura da tela, então ela quebra em duas
    // fileiras em vez de vazar pela borda. `rounded-3xl` é o mesmo desenho do
    // `rounded-full` numa fileira e continua inteiro quando são duas.
    return this.ativo()
      ? `${base} flex-wrap justify-end rounded-3xl max-w-[calc(100vw-1.5rem)]`
      : `${base} rounded-l-full border-r-0 translate-x-[calc(100%-2rem)] hover:translate-x-0 focus-within:translate-x-0`;
  });

  protected readonly classesToggle = computed(() => {
    const base = 'flex h-9 w-9 items-center justify-center rounded-full transition-colors';
    return this.ativo()
      ? `${base} shadow-inner`
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

  /** `<input type="color">`: o espectro inteiro, pelo seletor do sistema. */
  protected escolherDoEspectro(evento: Event): void {
    const valor = (evento.target as HTMLInputElement | null)?.value;
    if (valor) this.grifo.selecionarCorLivre(valor);
  }

  protected limparQuestao(): void {
    const id = this.questaoId();
    if (id) this.grifo.limparQuestao(id);
  }
}
