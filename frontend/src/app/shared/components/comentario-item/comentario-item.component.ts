import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { Flag, LucideIconData, Pencil, ThumbsDown, ThumbsUp, Trash2, UserX } from 'lucide-angular';
import type { ComentarioQuestao } from '../../../core/models/comentario';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import { UiAvatarComponent } from '../ui/avatar/ui-avatar.component';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-comentario-item',
  standalone: true,
  imports: [TimeAgoPipe, UiAvatarComponent, UiIconComponent, ComentarioItemComponent],
  templateUrl: './comentario-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComentarioItemComponent {
  comentario = input.required<ComentarioQuestao>();
  nivel = input<0 | 1>(0);

  votar = output<{ comentarioId: string; valor: -1 | 1 }>();
  denunciar = output<string>();
  editar = output<{ comentarioId: string; conteudo: string }>();
  excluir = output<string>();
  responder = output<{ parentId: string; conteudo: string }>();

  protected readonly thumbsUpIcon: LucideIconData = ThumbsUp;
  protected readonly thumbsDownIcon: LucideIconData = ThumbsDown;
  protected readonly flagIcon: LucideIconData = Flag;
  protected readonly pencilIcon: LucideIconData = Pencil;
  protected readonly trash2Icon: LucideIconData = Trash2;
  protected readonly userXIcon: LucideIconData = UserX;

  protected readonly editando = signal(false);
  protected readonly textoEdicao = signal('');
  protected readonly mostrarFormResposta = signal(false);
  protected readonly textoResposta = signal('');
  protected readonly confirmandoExclusao = signal(false);

  protected onVotar(valor: -1 | 1): void {
    this.votar.emit({ comentarioId: this.comentario().id, valor });
  }

  protected iniciarEdicao(): void {
    this.textoEdicao.set(this.comentario().conteudo ?? '');
    this.editando.set(true);
  }

  protected cancelarEdicao(): void {
    this.editando.set(false);
  }

  protected onInputEdicao(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.textoEdicao.set(target.value);
  }

  protected confirmarEdicao(): void {
    const texto = this.textoEdicao().trim();
    if (!texto) return;
    this.editar.emit({ comentarioId: this.comentario().id, conteudo: texto });
    this.editando.set(false);
  }

  protected toggleFormResposta(): void {
    this.mostrarFormResposta.update((v) => !v);
  }

  protected cancelarResposta(): void {
    this.mostrarFormResposta.set(false);
    this.textoResposta.set('');
  }

  protected onInputResposta(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.textoResposta.set(target.value);
  }

  protected confirmarResposta(): void {
    const texto = this.textoResposta().trim();
    if (!texto) return;
    this.responder.emit({ parentId: this.comentario().id, conteudo: texto });
    this.mostrarFormResposta.set(false);
    this.textoResposta.set('');
  }

  protected pedirConfirmacaoExclusao(): void {
    this.confirmandoExclusao.set(true);
  }

  protected cancelarExclusao(): void {
    this.confirmandoExclusao.set(false);
  }

  protected onExcluir(): void {
    this.confirmandoExclusao.set(false);
    this.excluir.emit(this.comentario().id);
  }

  protected onDenunciar(): void {
    this.denunciar.emit(this.comentario().id);
  }
}
