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

  /** Botão discreto de anular (só quando ainda não anulada pelo aluno). */
  protected readonly mostrarBotaoAnular = computed(
    () => this.podeAnular() && !this.anuladaUsuario() && !this.anuladaAdmin(),
  );

  /** Nada a exibir quando não há recurso, anulação nem opção de anular. */
  protected readonly visivel = computed(
    () => this.temRecurso() || this.anulada() || this.podeAnular(),
  );

  protected toggleRecurso(): void {
    this.recursoAberto.update((v) => !v);
  }

  protected anular(): void {
    if (this.processando()) return;
    this.toggleAnular.emit(true);
  }

  protected desanular(): void {
    if (this.processando()) return;
    this.toggleAnular.emit(false);
  }
}
