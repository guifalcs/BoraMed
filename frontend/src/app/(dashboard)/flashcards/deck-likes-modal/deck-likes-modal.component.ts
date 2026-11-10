import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  inject,
  input,
  output,
  signal,
  viewChild,
  type OnInit,
  type AfterViewInit,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
export class DeckLikesModalComponent implements OnInit, AfterViewInit {
  private readonly flashcardService = inject(FlashcardService);

  deckId = input.required<string>();
  fechar = output<void>();

  protected readonly iconX = X;
  protected readonly likes = signal<DeckLikeUsuario[]>([]);
  protected readonly loading = signal(true);
  protected readonly temMais = signal(true);
  protected readonly erro = signal<string | null>(null);
  private readonly caixa = viewChild.required<ElementRef<HTMLDialogElement>>('caixa');
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngAfterViewInit(): void {
    if (this.isBrowser) this.caixa().nativeElement.showModal();
  }

  // No construtor o input required ainda não está disponível (NG0950): a promise
  // rejeitava e o modal ficava em "Carregando…" para sempre.
  ngOnInit(): void {
    void this.carregar(0);
  }

  private async carregar(offset: number): Promise<void> {
    this.loading.set(true);
    this.erro.set(null);
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
    if (this.loading()) return;
    await this.carregar(this.likes().length);
  }

  protected handleFechar(): void {
    this.caixa().nativeElement.close();
    this.fechar.emit();
  }

  protected onEscape(evento: Event): void {
    evento.preventDefault();
    this.handleFechar();
  }

  protected clicarFundo(evento: MouseEvent): void {
    if (evento.target === this.caixa().nativeElement) this.handleFechar();
  }

  protected conterFoco(evento: KeyboardEvent): void {
    if (evento.key !== 'Tab') return;
    const botoes = [
      ...this.caixa().nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
    ];
    const primeiro = botoes[0];
    const ultimo = botoes[botoes.length - 1];
    if (
      (!evento.shiftKey && document.activeElement === ultimo) ||
      (evento.shiftKey && document.activeElement === primeiro)
    ) {
      evento.preventDefault();
      (evento.shiftKey ? ultimo : primeiro)?.focus();
    }
  }
}
