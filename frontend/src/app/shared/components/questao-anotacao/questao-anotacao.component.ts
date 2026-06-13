import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { StickyNote, Trash2 } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-questao-anotacao',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './questao-anotacao.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoAnotacaoComponent implements OnDestroy {
  conteudo = input<string | null>(null);
  salvando = input(false);
  erro = input<string | null>(null);
  questaoNumero = input.required<number>();

  salvar = output<string>();
  excluir = output<void>();

  protected readonly stickyNoteIcon = StickyNote;
  protected readonly trashIcon = Trash2;
  protected readonly aberto = signal(false);
  protected readonly texto = signal('');
  protected readonly tocado = signal(false);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly temConteudo = computed(() => this.texto().trim().length > 0);
  protected readonly contador = computed(() => this.texto().length);
  protected readonly preview = computed(() => {
    const text = this.texto().trim().replace(/\s+/g, ' ');
    if (text.length <= 96) return text;
    return `${text.slice(0, 96)}...`;
  });

  constructor() {
    effect(() => {
      const conteudo = this.conteudo() ?? '';
      if (!this.tocado()) {
        this.texto.set(conteudo);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
  }

  protected toggleAberto(): void {
    this.aberto.update((value) => !value);
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.tocado.set(true);
    this.texto.set(target.value);

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.salvar.emit(this.texto());
      this.tocado.set(false);
    }, 750);
  }

  protected onExcluir(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.texto.set('');
    this.tocado.set(false);
    this.excluir.emit();
  }
}
