import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Heart, Layers, LucideIconData, Lock, Users } from 'lucide-angular';
import type { FeedDeck, FlashcardDeck } from '../../../core/models/flashcard';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';

export type DeckCardItem = FlashcardDeck | FeedDeck;

/** Type guard: itens do feed da comunidade têm `autor_nome`/`curtido_por_mim`, decks "normais" não. */
export function isFeedDeck(deck: DeckCardItem): deck is FeedDeck {
  return 'autor_nome' in deck;
}

@Component({
  selector: 'app-deck-card',
  standalone: true,
  imports: [UiIconComponent, TimeAgoPipe],
  templateUrl: './deck-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckCardComponent {
  deck = input.required<DeckCardItem>();
  mostrarAutor = input(false);
  mostrarAcoes = input(false);

  estudar = output<string>();
  editar = output<string>();
  excluir = output<string>();
  toggleLike = output<string>();
  verCurtidas = output<string>();

  protected readonly layersIcon: LucideIconData = Layers;
  protected readonly heartIcon: LucideIconData = Heart;
  protected readonly lockIcon: LucideIconData = Lock;
  protected readonly usersIcon: LucideIconData = Users;

  protected readonly isFeed = computed(() => isFeedDeck(this.deck()));

  protected readonly isOficial = computed(() => {
    const d = this.deck();
    return !isFeedDeck(d) && d.oficial;
  });

  protected readonly isPublico = computed(() => {
    const d = this.deck();
    return !isFeedDeck(d) && d.publico;
  });

  protected readonly curtidoPorMim = computed(() => {
    const d = this.deck();
    return isFeedDeck(d) ? d.curtido_por_mim : false;
  });

  protected readonly autorNome = computed(() => {
    const d = this.deck();
    return isFeedDeck(d) ? d.autor_nome : null;
  });

  protected handleToggleLike(event: Event): void {
    event.stopPropagation();
    this.toggleLike.emit(this.deck().id);
  }

  protected handleEditar(event: Event): void {
    event.stopPropagation();
    this.editar.emit(this.deck().id);
  }

  protected handleExcluir(event: Event): void {
    event.stopPropagation();
    this.excluir.emit(this.deck().id);
  }

  protected handleVerCurtidas(event: Event): void {
    event.stopPropagation();
    this.verCurtidas.emit(this.deck().id);
  }
}
