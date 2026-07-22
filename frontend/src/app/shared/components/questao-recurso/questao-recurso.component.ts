import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Ban, ChevronDown, ChevronUp, FileText, Info, Scale, Undo2 } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

/**
 * Faixa de recurso/anulação exibida no topo da questão — em qualquer tela onde
 * a questão apareça (execução, revisão, admin).
 *
 * Regras de negócio:
 * - `recursoTexto`: texto do recurso (anulação/modificação pela faculdade). O
 *   aluno só visualiza; enquanto houver recurso, NÃO pode anular por conta própria.
 * - `anuladaAdmin`: anulação global. A questão fica marcada como anulada e fora
 *   das métricas; o recurso (se houver) explica o motivo.
 * - `anuladaUsuario`: o aluno anulou por conta própria (só possível em questões
 *   sem recurso e não anuladas pelo admin).
 * - `podeAnular`: exibe o botão discreto de anular/desanular (tentativa ativa,
 *   questão sem recurso e não anulada pelo admin).
 */
@Component({
  selector: 'app-questao-recurso',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './questao-recurso.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoRecursoComponent {
  recursoTexto = input<string | null>(null);
  anuladaAdmin = input<boolean>(false);
  anuladaUsuario = input<boolean>(false);
  podeAnular = input<boolean>(false);
  processando = input<boolean>(false);
  questaoNumero = input<number>(0);

  /** Emite o novo estado desejado: true = anular, false = desanular. */
  toggleAnular = output<boolean>();

  protected readonly iconRecurso = Scale;
  protected readonly iconAnulada = Ban;
  protected readonly iconInfo = Info;
  protected readonly iconTexto = FileText;
  protected readonly iconUndo = Undo2;
  protected readonly iconChevronDown = ChevronDown;
  protected readonly iconChevronUp = ChevronUp;

  protected readonly recursoAberto = signal(false);

  protected readonly temRecurso = computed(() => (this.recursoTexto() ?? '').trim().length > 0);
  protected readonly anulada = computed(() => this.anuladaAdmin() || this.anuladaUsuario());

  /**
   * Faixa informativa: recurso ou anulação. O botão discreto de anular vive no
   * cabeçalho do QuestaoCard (alinhado ao "Questão N"); aqui fica só o "Desfazer"
   * dentro da faixa de anulação pelo próprio aluno.
   */
  protected readonly visivel = computed(() => this.temRecurso() || this.anulada());

  protected toggleRecurso(): void {
    this.recursoAberto.update((v) => !v);
  }

  protected desanular(): void {
    if (this.processando()) return;
    this.toggleAnular.emit(false);
  }
}
