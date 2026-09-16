import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Eraser, Highlighter, Trash2 } from 'lucide-angular';
import { FocoModoService } from '../../../core/services/foco-modo.service';
import { GrifoService } from '../../../core/services/grifo.service';
import {
  CORES_PADRAO,
  NOME_DAS_CORES_PADRAO,
  type CorGrifo,
  type FerramentaGrifo,
} from '../../utils/grifo';
import { corDoTextoSobre, gerarEspectroGrifo } from '../../utils/grifo-cor';
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
   * Revisão pós-prova: os grifos feitos durante o simulado ficam à vista, mas
   * o estojo só oferece borracha e limpar. Grifar ali misturaria o que o aluno
   * marcou sob o relógio com o que marcou depois, lendo o gabarito.
   *
   * Sai do serviço, e não de um input, porque o `GrifoRenderService` precisa
   * do mesmo dado para não guardar a borracha a cada clique fora.
   */
  protected readonly somenteBorracha = computed(() => this.grifo.escopo() === 'revisao');

  /** Pedido de limpar a revisão inteira — quem confirma é a tela. */
  limparTudo = output<void>();

  /**
   * Atalhos da paleta. O resto do espectro sai do seletor de cor ao lado —
   * quatro botões cobrem o uso comum sem virar um leque de tinta na tela.
   * A amostra é a própria cor que pinta o texto: o botão prevê o resultado.
   */
  protected readonly cores = CORES_PADRAO;
  /** Cores escolhidas na grade, à mão sem reabrir o painel. */
  protected readonly recentes = this.grifo.recentes;

  /** Grade que cobre o espectro, aberta pelo botão do anel colorido. */
  protected readonly espectro = gerarEspectroGrifo();
  protected readonly paletaAberta = signal(false);

  constructor() {
    // Guardar o marca-texto fecha a grade junto: ela não tem por que ficar
    // aberta cobrindo a prova depois que a caneta saiu da mão.
    effect(() => {
      if (!this.grifo.modoAtivo()) this.paletaAberta.set(false);
    });
  }
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

  protected readonly rotuloToggle = computed(() => {
    if (this.somenteBorracha()) {
      return this.ativo() ? 'Guardar a borracha' : 'Apagar grifos';
    }
    return this.ativo() ? 'Guardar o marca-texto' : 'Pegar o marca-texto';
  });

  /** O título carrega o atalho; o `aria-label` fica só com a ação. */
  protected readonly tituloToggle = computed(() =>
    this.somenteBorracha()
      ? `${this.rotuloToggle()} (Shift + G)`
      : `${this.rotuloToggle()} (G)`,
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
    if (this.somenteBorracha()) {
      return this.ativo()
        ? `${base} bg-[var(--color-surface-2)] text-[var(--color-text)] ring-2 ring-[var(--color-text)]`
        : `${base} bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]`;
    }
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

  /** Mesma semântica do atalho `G`: com a borracha na mão, devolve a caneta. */
  protected toggle(): void {
    this.grifo.alternarCaneta();
  }

  protected escolher(ferramenta: FerramentaGrifo): void {
    // Clicar na ferramenta já em uso guarda o marca-texto de volta no estojo.
    if (this.grifo.modoAtivo() && this.grifo.ferramenta() === ferramenta) {
      this.grifo.modoAtivo.set(false);
      return;
    }
    this.grifo.selecionarFerramenta(ferramenta);
  }

  protected alternarPaleta(): void {
    if (!this.grifo.modoAtivo()) this.grifo.modoAtivo.set(true);
    this.paletaAberta.update((v) => !v);
  }

  /** Cor da grade: entra em uso e fecha o painel, que já cumpriu o papel. */
  protected escolherDoEspectro(cor: CorGrifo): void {
    this.grifo.selecionarFerramenta(cor);
    this.paletaAberta.set(false);
  }

  protected classesCorDoEspectro(cor: CorGrifo): string {
    const base = 'h-6 w-full rounded-md transition-transform';
    return this.ferramenta() === cor
      ? `${base} scale-110 ring-2 ring-[var(--color-text)]`
      : `${base} ring-1 ring-black/10 hover:scale-110`;
  }

  protected classesAnelEspectro(): string {
    const base = 'pointer-events-none block h-6 w-6 rounded-full bm-espectro';
    return this.paletaAberta()
      ? `${base} ring-2 ring-[var(--color-text)]`
      : `${base} ring-1 ring-black/10`;
  }

  /**
   * Na execução há uma questão na tela e o alvo é ela. Na revisão a prova
   * inteira está na página, então o alvo é a revisão toda — e a tela pede
   * confirmação antes, porque aí é destrutivo de verdade.
   */
  protected limpar(): void {
    if (this.somenteBorracha()) {
      this.limparTudo.emit();
      return;
    }
    const id = this.questaoId();
    if (id) this.grifo.limparQuestao(id);
  }

  protected readonly rotuloLimpar = computed(() =>
    this.somenteBorracha()
      ? 'Limpar todos os grifos desta revisão'
      : 'Limpar todos os grifos desta questão',
  );

  /** Na revisão o botão vale para a prova toda, então basta existir grifo. */
  protected readonly podeLimpar = computed(() =>
    this.somenteBorracha() ? this.grifo.totalGrifos() > 0 : this.temGrifosNaQuestao(),
  );
}
