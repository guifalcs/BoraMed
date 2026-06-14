import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChevronDown, ChevronUp, LucideIconData, MessageSquare } from 'lucide-angular';

import { ComentarioQuestaoService } from '../../../core/services/comentario-questao.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { ComentarioItemComponent } from '../comentario-item/comentario-item.component';

@Component({
  selector: 'app-questao-comentarios',
  standalone: true,
  imports: [UiIconComponent, ComentarioItemComponent],
  providers: [ComentarioQuestaoService],
  templateUrl: './questao-comentarios.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoComentariosComponent {
  questaoId = input.required<string>();

  protected readonly service = inject(ComentarioQuestaoService);
  protected readonly expandido = signal(false);
  protected readonly erroEnvio = signal<string | null>(null);
  protected readonly textoNovo = signal('');

  protected readonly messageSquareIcon: LucideIconData = MessageSquare;
  protected readonly chevronDownIcon: LucideIconData = ChevronDown;
  protected readonly chevronUpIcon: LucideIconData = ChevronUp;

  private readonly isBrowser: boolean;

  constructor() {
    const platformId = inject(PLATFORM_ID);
    this.isBrowser = isPlatformBrowser(platformId);

    effect(() => {
      const id = this.questaoId();
      untracked(() => {
        this.service.limpar();

        if (this.isBrowser) {
          const salvo = localStorage.getItem(`bm_coment_exp_${id}`);
          this.expandido.set(salvo === 'true');
        }

        if (this.expandido() && !this.service.isLoading()) {
          void this.service.carregar(id);
        }
      });
    });
  }

  toggleExpandido(): void {
    const novoEstado = !this.expandido();
    this.expandido.set(novoEstado);

    if (this.isBrowser) {
      localStorage.setItem(`bm_coment_exp_${this.questaoId()}`, String(novoEstado));
    }

    if (novoEstado && this.service.comentarios().length === 0 && !this.service.isLoading()) {
      void this.service.carregar(this.questaoId());
    }
  }

  async onEnviarComentario(): Promise<void> {
    this.erroEnvio.set(null);
    const resultado = await this.service.criar(this.questaoId(), this.textoNovo().trim());

    if (!resultado.ok) {
      if ((resultado as { ok: false; code?: string }).code === 'P0010') {
        this.erroEnvio.set('Seu comentário contém linguagem inapropriada.');
      } else {
        this.erroEnvio.set('Não foi possível enviar. Tente novamente.');
      }
      return;
    }

    this.textoNovo.set('');
  }

  onVotar(evento: { comentarioId: string; valor: -1 | 1 }): void {
    void this.service.votar(evento.comentarioId, evento.valor);
  }

  onDenunciar(comentarioId: string): void {
    void this.service.denunciar(comentarioId);
  }

  onEditar(evento: { comentarioId: string; conteudo: string }): void {
    void this.service.editar(evento.comentarioId, evento.conteudo);
  }

  onExcluir(comentarioId: string): void {
    void this.service.excluir(comentarioId);
  }

  onResponder(evento: { parentId: string; conteudo: string }): void {
    void this.service.criar(this.questaoId(), evento.conteudo, evento.parentId);
  }
}
