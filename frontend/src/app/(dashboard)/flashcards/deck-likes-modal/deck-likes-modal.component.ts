import { ChangeDetectionStrategy, Component, HostListener, inject, input, output, signal } from '@angular/core';
import { X } from 'lucide-angular';
import { FlashcardService } from '../../../core/services/flashcard.service';
import type { DeckLikeUsuario } from '../../../core/models/flashcard';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-deck-likes-modal',
  standalone: true,
  imports: [UiIconComponent, TimeAgoPipe],
  templateUrl: './deck-likes-modal.component.html',
  styleUrl: './deck-likes-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckLikesModalComponent {
  private readonly flashcardService = inject(FlashcardService);

  deckId = input.required<string>();
  fechar = output<void>();

  protected readonly iconX = X;
  protected readonly likes = signal<DeckLikeUsuario[]>([]);
  protected readonly loading = signal(true);
  protected readonly temMais = signal(true);
  protected readonly erro = signal<string | null>(null);

  constructor() {
    void this.carregar(0);
  }

  private async carregar(offset: number): Promise<void> {
    this.loading.set(true);
    const result = await this.flashcardService.listarLikesDeck(this.deckId(), PAGE_SIZE, offset);
    if (result.ok) {
      this.likes.update((prev) => (offset === 0 ? result.data : [...prev, ...result.data]));
      this.temMais.set(result.data.length === PAGE_SIZE);
    } else {
      this.erro.set(result.error);
    }
    this.loading.set(false);
  }

  protected async carregarMais(): Promise<void> {
    await this.carregar(this.likes().length);
  }

  protected handleFechar(): void {
    this.fechar.emit();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.handleFechar();
  }
}
